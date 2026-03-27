import { Router } from "express";
import type { Db } from "../db";
import { all, get, run } from "../db";
import { ProductCreateSchema, ProductQuerySchema, ProductUpdateSchema } from "../schema";
import { canOp, filterProductFields } from "../permissions";

type ProductRow = {
  id: number;
  code: string;
  customerName: string;
  productName: string;
  quantity: number;
  location: "A" | "B" | "C" | "D" | "E";
  status: "成品" | "半成品" | "不良品" | "原料" | "埋入件";
  note: string;
  updatedAt: string;
  createdBy?: number | null;
  createdAt?: string | null;
};

const PRODUCT_FIELD_KEYS = ["code", "customerName", "productName", "quantity", "location", "status", "note"] as const;

function buildHistoryChanges(existing: ProductRow, next: ProductRow): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of PRODUCT_FIELD_KEYS) {
    const a = (existing as any)[k];
    const b = (next as any)[k];
    if (a !== b && (a !== undefined || b !== undefined)) {
      out[k] = { old: a, new: b };
    }
  }
  return out;
}

function toOrderBy(sort: string): string {
  switch (sort) {
    case "updatedAt_asc":
      return "updatedAt ASC";
    case "code_asc":
      return "code ASC";
    case "code_desc":
      return "code DESC";
    case "updatedAt_desc":
    default:
      return "updatedAt DESC";
  }
}

export function productsRouter(db: Db) {
  const r = Router();

  r.get("/", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "list")) {
      console.warn("[403 forbidden] GET /api/products", {
        userId: user?.id,
        role: user?.role,
        allowedOps: user?.allowedOps,
        reason: !user ? "no user" : "missing list permission",
      });
      return res.status(403).json({ error: "forbidden" });
    }

    const parsed = ProductQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    }

    const q = parsed.data.q;
    const where: string[] = [];
    const params: unknown[] = [];

    if (q) {
      where.push("(code LIKE ? OR customerName LIKE ? OR productName LIKE ? OR note LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (parsed.data.customerName) {
      where.push("customerName LIKE ?");
      params.push(`%${parsed.data.customerName}%`);
    }
    if (parsed.data.status) {
      where.push("status = ?");
      params.push(parsed.data.status);
    }
    if (parsed.data.location) {
      where.push("location = ?");
      params.push(parsed.data.location);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const page = parsed.data.page;
    const pageSize = parsed.data.pageSize;
    const offset = (page - 1) * pageSize;
    const orderBy = toOrderBy(parsed.data.sort);

    const countRow = await get<{ total: number }>(
      db,
      `SELECT COUNT(*) as total FROM products ${whereSql}`,
      params
    );
    const total = countRow?.total ?? 0;

    const rows = await all<ProductRow>(
      db,
      `SELECT id, code, customerName, productName, quantity, location, status, note, updatedAt
       FROM products
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const filtered = rows.map((r) =>
      filterProductFields(r, user.visibleFields, { alwaysIncludeId: true })
    );
    return res.json({ data: filtered, page, pageSize, total });
  });

  r.get("/customers", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "list")) {
      return res.status(403).json({ error: "forbidden" });
    }
    const rows = await all<{ customerName: string }>(
      db,
      "SELECT DISTINCT customerName FROM products ORDER BY customerName"
    );
    const customers = rows.map((r) => r.customerName);
    return res.json({ customers });
  });

  r.get("/suggest-code", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "create")) {
      return res.status(403).json({ error: "forbidden" });
    }
    const rows = await all<{ code: string }>(db, "SELECT code FROM products");
    const re = /^P-(\d+)$/;
    let maxN = 0;
    for (const r of rows) {
      const m = r.code.match(re);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    const next = String(maxN + 1).padStart(4, "0");
    return res.json({ code: `P-${next}` });
  });

  r.get("/:id/detail", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "list")) {
      console.warn("[403 forbidden] GET /api/products/:id/detail", {
        userId: user?.id,
        role: user?.role,
        allowedOps: user?.allowedOps,
        reason: !user ? "no user" : "missing list permission",
      });
      return res.status(403).json({ error: "forbidden" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "bad_request" });
    }

    const row = await get<ProductRow>(db, "SELECT * FROM products WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "not_found" });

    const filtered = filterProductFields(row, user.visibleFields, { alwaysIncludeId: true }) as Partial<ProductRow>;

    let createdByUser: { username: string; displayName: string } | null = null;
    if (row.createdBy) {
      const creator = await get<{ username: string; displayName: string }>(
        db,
        "SELECT username, displayName FROM users WHERE id = ?",
        [row.createdBy]
      );
      if (creator) createdByUser = creator;
    }

    type HistoryRow = { userId: number; changedAt: string; changes: string };
    const historyRows = await all<HistoryRow>(
      db,
      "SELECT userId, changedAt, changes FROM product_history WHERE productId = ? ORDER BY changedAt DESC",
      [id]
    );

    const history: Array<{
      byUser: { username: string; displayName: string };
      changedAt: string;
      changes: Array<{ field: string; old: unknown; new: unknown }>;
    }> = [];

    for (const hr of historyRows) {
      const byUser = await get<{ username: string; displayName: string }>(
        db,
        "SELECT username, displayName FROM users WHERE id = ?",
        [hr.userId]
      );
      let changesList: Array<{ field: string; old: unknown; new: unknown }> = [];
      try {
        const obj = JSON.parse(hr.changes) as Record<string, { old: unknown; new: unknown }>;
        changesList = Object.entries(obj).map(([field, v]) => ({ field, old: v.old, new: v.new }));
      } catch {}
      history.push({
        byUser: byUser ?? { username: String(hr.userId), displayName: "" },
        changedAt: hr.changedAt,
        changes: changesList,
      });
    }

    return res.json({
      data: filtered,
      createdByUser,
      createdAt: row.createdAt ?? null,
      history,
    });
  });

  r.get("/:id", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "list")) {
      console.warn("[403 forbidden] GET /api/products/:id", {
        userId: user?.id,
        role: user?.role,
        allowedOps: user?.allowedOps,
        reason: !user ? "no user" : "missing list permission",
      });
      return res.status(403).json({ error: "forbidden" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "bad_request" });
    }

    const row = await get<ProductRow>(db, "SELECT * FROM products WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "not_found" });

    const filtered = filterProductFields(row, user.visibleFields, { alwaysIncludeId: true });
    return res.json({ data: filtered });
  });

  r.post("/", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "create")) {
      console.warn("[403 forbidden] POST /api/products", {
        userId: user?.id,
        role: user?.role,
        allowedOps: user?.allowedOps,
        reason: !user ? "no user" : "missing create permission",
      });
      return res.status(403).json({ error: "forbidden" });
    }

    const parsed = ProductCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    }

    let data = parsed.data as Record<string, unknown>;
    if (user.role === "client" && user.visibleFields && user.visibleFields.length > 0) {
      const allowed = new Set(user.visibleFields);
      data = {};
      for (const k of Object.keys(parsed.data)) {
        if (allowed.has(k)) data[k] = (parsed.data as any)[k];
      }
      const required = ["code", "customerName", "productName", "quantity", "location", "status"];
      for (const r of required) {
        if (data[r] === undefined || data[r] === null || (r === "quantity" && Number(data[r]) < 0)) {
          return res.status(400).json({ error: "bad_request", message: "缺少必填欄位或無權限填寫該欄位" });
        }
      }
    }

    const now = new Date().toISOString();
    const userId = user.id;

    try {
      const result = await run(
        db,
        `
        INSERT INTO products (code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          data.code,
          data.customerName,
          data.productName,
          data.quantity,
          data.location,
          data.status,
          (data.note as string) ?? "",
          now,
          userId,
          now,
        ]
      );
      const row = await get<ProductRow>(db, "SELECT * FROM products WHERE id = ?", [result.lastID]);
      if (!row) return res.status(500).json({ error: "internal_error" });
      const filtered = filterProductFields(row, user.visibleFields, { alwaysIncludeId: true });
      return res.status(201).json({ data: filtered });
    } catch (e: any) {
      if (String(e?.message ?? "").includes("UNIQUE")) {
        return res.status(409).json({ error: "conflict", message: "編號(code)已存在" });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  });

  r.put("/:id", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "update")) {
      console.warn("[403 forbidden] PUT /api/products/:id", {
        userId: user?.id,
        role: user?.role,
        allowedOps: user?.allowedOps,
        reason: !user ? "no user" : "missing update permission",
      });
      return res.status(403).json({ error: "forbidden" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad_request" });

    const parsed = ProductUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });

    const existing = await get<ProductRow>(db, "SELECT * FROM products WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "not_found" });

    // client 僅能更新其「可見欄位」內的欄位，其餘忽略
    let patch: Partial<ProductRow> = parsed.data;
    if (user.role === "client" && user.visibleFields && user.visibleFields.length > 0) {
      const allowed = new Set(user.visibleFields);
      patch = {};
      for (const k of Object.keys(parsed.data) as (keyof ProductRow)[]) {
        if (allowed.has(k)) (patch as any)[k] = (parsed.data as any)[k];
      }
    }

    const next = { ...existing, ...patch, note: (patch.note ?? existing.note) as string };
    const now = new Date().toISOString();
    const changesObj = buildHistoryChanges(existing, next as ProductRow);

    try {
      if (Object.keys(changesObj).length > 0) {
        await run(
          db,
          "INSERT INTO product_history (productId, userId, changedAt, changes) VALUES (?, ?, ?, ?)",
          [id, user.id, now, JSON.stringify(changesObj)]
        );
      }
      await run(
        db,
        `
        UPDATE products
        SET code = ?, customerName = ?, productName = ?, quantity = ?, location = ?, status = ?, note = ?, updatedAt = ?
        WHERE id = ?
        `,
        [
          next.code,
          next.customerName,
          next.productName,
          next.quantity,
          next.location,
          next.status,
          next.note,
          now,
          id,
        ]
      );
      const row = await get<ProductRow>(db, "SELECT * FROM products WHERE id = ?", [id]);
      if (!row) return res.status(500).json({ error: "internal_error" });
      const filtered = filterProductFields(row, user.visibleFields, { alwaysIncludeId: true });
      return res.json({ data: filtered });
    } catch (e: any) {
      if (String(e?.message ?? "").includes("UNIQUE")) {
        return res.status(409).json({ error: "conflict", message: "編號(code)已存在" });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  });

  r.delete("/:id", async (req, res) => {
    const user = req.authUser;
    if (!user || !canOp(user.allowedOps, "delete")) {
      console.warn("[403 forbidden] DELETE /api/products/:id", {
        userId: user?.id,
        role: user?.role,
        allowedOps: user?.allowedOps,
        reason: !user ? "no user" : "missing delete permission",
      });
      return res.status(403).json({ error: "forbidden" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad_request" });
    const existing = await get<ProductRow>(db, "SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "not_found" });
    await run(db, "DELETE FROM products WHERE id = ?", [id]);
    return res.status(204).send();
  });

  return r;
}

