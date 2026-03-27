/**
 * 產品欄位與操作權限定義
 * admin 不受限；viewer 僅 list；client 依 DB 的 visible_fields / allowed_ops
 */

export const PRODUCT_FIELDS = [
  "id",
  "code",
  "customerName",
  "productName",
  "quantity",
  "location",
  "status",
  "note",
  "updatedAt",
] as const;

export type ProductFieldName = (typeof PRODUCT_FIELDS)[number];

export const PRODUCT_OPS = ["list", "create", "update", "delete"] as const;

export type ProductOp = (typeof PRODUCT_OPS)[number];

/** 過濾一筆產品資料，只保留允許的欄位；client 回應時一律含 id（供編輯/刪除識別） */
export function filterProductFields<T extends Record<string, unknown>>(
  row: T,
  visibleFields: string[] | null | undefined,
  options?: { alwaysIncludeId?: boolean }
): Partial<T> {
  if (!visibleFields || visibleFields.length === 0) return row;
  const set = new Set(visibleFields);
  if (options?.alwaysIncludeId && row.id !== undefined) set.add("id");
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    if (set.has(k)) out[k] = row[k];
  }
  return out as Partial<T>;
}

/** 檢查是否允許某操作（null/undefined allowedOps = 全部允許，如 admin） */
export function canOp(
  allowedOps: string[] | null | undefined,
  op: ProductOp
): boolean {
  if (!allowedOps || allowedOps.length === 0) return true;
  return allowedOps.includes(op);
}
