/**
 * 從 backend/data/import/products.xlsx 或 products.xls 匯入產品資料。
 * 初始檔案只需「客戶名稱」「產品名稱」兩欄；編號依序自動產生，其餘欄位使用預設值（之後可於系統內修改）。
 * 執行：cd backend && npm run import:products
 */

import path from "node:path";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { openDb, run, get, all } from "../src/db";
import { initSchema } from "../src/db";

const IMPORT_DIR = path.join(process.cwd(), "data", "import");

const HEADER_MAP: Record<string, string> = {
  編號: "code",
  code: "code",
  客戶名稱: "customerName",
  customerName: "customerName",
  產品名稱: "productName",
  productName: "productName",
  庫存數量: "quantity",
  quantity: "quantity",
  庫位: "location",
  location: "location",
  狀態: "status",
  status: "status",
  備註: "note",
  note: "note",
};

const LOCATIONS = new Set(["A", "B", "C", "D", "E"]);
const STATUSES = new Set(["成品", "半成品", "不良品", "原料", "埋入件"]);

function trim(s: unknown): string {
  if (s == null) return "";
  return String(s).trim();
}

function parseQuantity(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** 取得下一個可用的編號序號（P-0001, P-0002, ...） */
async function getNextCodeNumber(db: Awaited<ReturnType<typeof openDb>>): Promise<number> {
  const rows = await all<{ code: string }>(db, "SELECT code FROM products");
  const re = /^P-(\d+)$/;
  let maxN = 0;
  for (const r of rows) {
    const m = r.code.match(re);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return maxN + 1;
}

async function main() {
  let filePath: string | null = null;
  for (const name of ["products.xlsx", "products.xls"]) {
    const p = path.join(IMPORT_DIR, name);
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }
  if (!filePath) {
    console.error(`找不到匯入檔。請將 products.xlsx 或 products.xls 放到：${IMPORT_DIR}`);
    process.exit(1);
  }

  console.log(`讀取 ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  if (rows.length < 2) {
    console.error("Excel 至少需要標題列與一筆資料。");
    process.exit(1);
  }

  const headers = (rows[0] as unknown[]).map((h) => trim(h));
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = HEADER_MAP[headers[i] as string];
    if (key) colIndex[key] = i;
  }

  // 初始檔案只要求「客戶名稱」「產品名稱」
  if (colIndex.customerName === undefined || colIndex.productName === undefined) {
    console.error("缺少必要欄位。請至少包含：客戶名稱（或 customerName）、產品名稱（或 productName）。見 data/import/README.md");
    process.exit(1);
  }

  const db = openDb();
  await initSchema(db);

  let nextCodeNum = await getNextCodeNumber(db);
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const customerName = trim(row[colIndex.customerName]);
    const productName = trim(row[colIndex.productName]);

    if (!customerName && !productName) {
      skipped++;
      continue;
    }
    if (!customerName || !productName) {
      console.warn(`第 ${r + 1} 列客戶名稱或產品名稱為空，跳過。`);
      skipped++;
      continue;
    }

    // 編號依序自動產生
    const code = `P-${String(nextCodeNum).padStart(4, "0")}`;
    nextCodeNum += 1;

    // 有提供的欄位才用檔案值，沒有則用預設（待以後在系統內修改）
    const quantity = colIndex.quantity !== undefined ? parseQuantity(row[colIndex.quantity]) : 0;
    let location = colIndex.location !== undefined ? trim(row[colIndex.location]) : "A";
    let status = colIndex.status !== undefined ? trim(row[colIndex.status]) : "成品";
    const note = colIndex.note !== undefined ? trim(row[colIndex.note]) : "";

    if (location && !LOCATIONS.has(location)) location = "A";
    if (status && !STATUSES.has(status)) status = "成品";

    const existing = await get<{ id: number }>(db, "SELECT id FROM products WHERE code = ?", [code]);
    if (existing) {
      skipped++;
      continue;
    }

    try {
      await run(
        db,
        `INSERT INTO products (code, customerName, productName, quantity, location, status, note, updatedAt, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [code, customerName, productName, quantity, location || "A", status || "成品", note, now, now]
      );
      inserted++;
    } catch (e: any) {
      if (String(e?.message ?? "").includes("UNIQUE")) skipped++;
      else throw e;
    }
  }

  console.log(`匯入完成：新增 ${inserted} 筆，跳過 ${skipped} 筆。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
