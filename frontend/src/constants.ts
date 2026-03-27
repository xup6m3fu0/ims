/** 產品欄位對應中文標籤（用於表頭與權限設定） */
export const PRODUCT_FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  code: '編號',
  customerName: '客戶名稱',
  productName: '產品名稱',
  quantity: '庫存數量',
  location: '庫位',
  status: '狀態',
  note: '備註',
  updatedAt: '修改日期',
}

/** 操作對應中文標籤 */
export const PRODUCT_OP_LABELS: Record<string, string> = {
  list: '查詢列表',
  create: '新增',
  update: '編輯',
  delete: '刪除',
}
