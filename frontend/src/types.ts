/** 庫位 A～E */
export type Location = 'A' | 'B' | 'C' | 'D' | 'E'

/** 產品狀態 */
export type Status = '成品' | '半成品' | '不良品' | '原料' | '埋入件'

/** 產品資料 */
export type Product = {
  id: number
  code: string
  customerName: string
  productName: string
  quantity: number
  location: Location
  status: Status
  note: string
  updatedAt: string
}

/** 產品列表 API 回傳 */
export type ProductsListResponse = {
  data: Product[]
  page: number
  pageSize: number
  total: number
}

