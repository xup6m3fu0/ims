import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { env } from "./env";
import bcrypt from "bcryptjs";

sqlite3.verbose();

export type Db = sqlite3.Database;

function ensureDbDir(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function openDb(): Db {
  ensureDbDir(env.databasePath);
  const db = new sqlite3.Database(env.databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

export function run(
  db: Db,
  sql: string,
  params: unknown[] = []
): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params as any, function (err) {
      if (err) return reject(err);
      resolve({
        lastID: (this as any).lastID ?? 0,
        changes: (this as any).changes ?? 0,
      });
    });
  });
}

export function get<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params as any, (err, row) => {
      if (err) return reject(err);
      resolve(row as T | undefined);
    });
  });
}

export function all<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params as any, (err, rows) => {
      if (err) return reject(err);
      resolve((rows ?? []) as T[]);
    });
  });
}

export async function initSchema(db: Db) {
  await run(
    db,
    `
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      customerName TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL CHECK (location IN ('A','B','C','D','E')),
      status TEXT NOT NULL CHECK (status IN ('成品','半成品','不良品','原料','埋入件')),
      note TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL
    );
    `
  );

  await run(
    db,
    `
    CREATE TABLE IF NOT EXISTS product_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      changedAt TEXT NOT NULL,
      changes TEXT NOT NULL
    );
    `
  );
  await run(db, "CREATE INDEX IF NOT EXISTS idx_product_history_productId ON product_history(productId);");

  await run(
    db,
    `
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      displayName TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );
    `
  );

  await run(
    db,
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      displayName TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer','client')),
      visibleFields TEXT,
      allowedOps TEXT,
      createdBy INTEGER,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );
    `
  );

  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_customerName ON products(customerName);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_productName ON products(productName);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_location ON products(location);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_updatedAt ON products(updatedAt);");
  await run(
    db,
    "CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);"
  );
  await run(db, "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);");

  await migrateAdminUsersToUsers(db);
  await migrateProductsAddCreated(db);
  await migrateProductsStatusAddRawMaterial(db);
  await migrateProductsStatusAddEmbedded(db);

  if (env.seed) {
    await seedIfEmpty(db);
  }
}

async function migrateProductsAddCreated(db: Db) {
  const cols = await all<{ name: string }>(db, "PRAGMA table_info(products)");
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("createdBy")) {
    await run(db, "ALTER TABLE products ADD COLUMN createdBy INTEGER");
  }
  if (!names.has("createdAt")) {
    await run(db, "ALTER TABLE products ADD COLUMN createdAt TEXT");
  }
}

/** 擴充 status 允許「原料」：SQLite 無法 ALTER CHECK，故重建 products 表 */
async function migrateProductsStatusAddRawMaterial(db: Db) {
  const row = await get<{ sql: string }>(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'");
  const sql = row?.sql ?? "";
  if (sql.includes("'原料'")) return; // 已含原料，無需遷移
  await run(
    db,
    `
    CREATE TABLE products_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      customerName TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL CHECK (location IN ('A','B','C','D','E')),
      status TEXT NOT NULL CHECK (status IN ('成品','半成品','不良品','原料','埋入件')),
      note TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL,
      createdBy INTEGER,
      createdAt TEXT
    )
    `
  );
  await run(
    db,
    `INSERT INTO products_new (id, code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt)
     SELECT id, code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt FROM products`
  );
  await run(db, "DROP TABLE products");
  await run(db, "ALTER TABLE products_new RENAME TO products");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_customerName ON products(customerName);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_productName ON products(productName);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_location ON products(location);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_updatedAt ON products(updatedAt);");
}

/** 擴充 status 允許「埋入件」：若尚未含此值則重建 products 表 */
async function migrateProductsStatusAddEmbedded(db: Db) {
  const row = await get<{ sql: string }>(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'");
  const sql = row?.sql ?? "";
  if (sql.includes("'埋入件'")) return;
  await run(
    db,
    `
    CREATE TABLE products_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      customerName TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL CHECK (location IN ('A','B','C','D','E')),
      status TEXT NOT NULL CHECK (status IN ('成品','半成品','不良品','原料','埋入件')),
      note TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL,
      createdBy INTEGER,
      createdAt TEXT
    )
    `
  );
  await run(
    db,
    `INSERT INTO products_new (id, code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt)
     SELECT id, code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt FROM products`
  );
  await run(db, "DROP TABLE products");
  await run(db, "ALTER TABLE products_new RENAME TO products");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_customerName ON products(customerName);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_productName ON products(productName);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_location ON products(location);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_products_updatedAt ON products(updatedAt);");
}

async function migrateAdminUsersToUsers(db: Db) {
  const count = await get<{ total: number }>(db, "SELECT COUNT(*) as total FROM users");
  if ((count?.total ?? 0) > 0) return;

  const adminCount = await get<{ total: number }>(db, "SELECT COUNT(*) as total FROM admin_users");
  if ((adminCount?.total ?? 0) === 0) return;

  await run(
    db,
    `INSERT INTO users (id, username, passwordHash, displayName, role, visibleFields, allowedOps, createdBy, isActive, createdAt)
     SELECT id, username, passwordHash, displayName, role, NULL, NULL, NULL, isActive, createdAt FROM admin_users`
  );
}

async function seedIfEmpty(db: Db) {
  const userCount = await get<{ total: number }>(db, "SELECT COUNT(*) as total FROM users");
  if ((userCount?.total ?? 0) === 0) {
    const now = new Date().toISOString();
    const users = [
      { username: "admin", password: "86180017", displayName: "系統管理員", role: "admin" as const },
      { username: "viewer", password: "viewer123", displayName: "查詢帳號", role: "viewer" as const },
    ];
    for (const u of users) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await run(
        db,
        "INSERT INTO users (username, passwordHash, displayName, role, isActive, createdAt) VALUES (?, ?, ?, ?, 1, ?)",
        [u.username, passwordHash, u.displayName, u.role, now]
      );
    }
  }

  const productCount = await get<{ total: number }>(db, "SELECT COUNT(*) as total FROM products");
  if ((productCount?.total ?? 0) === 0) {
    const now = new Date().toISOString();
    const rows = [
      {
        code: "P-0001",
        customerName: "宏達公司",
        productName: "齒輪箱（大）",
        quantity: 120,
        location: "A",
        status: "成品",
        note: "首批到貨",
      },
      {
        code: "P-0002",
        customerName: "宏達公司",
        productName: "齒輪箱（小）",
        quantity: 35,
        location: "B",
        status: "半成品",
        note: "等待噴漆",
      },
      {
        code: "P-0003",
        customerName: "星航科技",
        productName: "控制板 v2",
        quantity: 8,
        location: "D",
        status: "不良品",
        note: "待 RMA",
      },
    ] as const;
    const adminId = await get<{ id: number }>(db, "SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const createdBy = adminId?.id ?? null;
    for (const p of rows) {
      await run(
        db,
        "INSERT INTO products (code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [p.code, p.customerName, p.productName, p.quantity, p.location, p.status, p.note, now, createdBy, now]
      );
    }
  }
}

