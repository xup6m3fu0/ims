import type { Product, ProductsListResponse } from './types'

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

/** 帶 cookie、JSON 的 fetch 封裝 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (res.status === 204) return undefined as any
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as T
}

// --- 產品 API ---

export async function listProducts(params: {
  q?: string
  customerName?: string
  status?: string
  location?: string
  page?: number
  pageSize?: number
  sort?: string
}): Promise<ProductsListResponse> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    qs.set(k, String(v))
  }
  return request<ProductsListResponse>(`/api/products?${qs.toString()}`)
}

export async function getCustomerNames(): Promise<{ customers: string[] }> {
  return request<{ customers: string[] }>('/api/products/customers')
}

export async function suggestProductCode(): Promise<{ code: string }> {
  return request<{ code: string }>('/api/products/suggest-code')
}

export async function createProduct(input: Omit<Product, 'id' | 'updatedAt'>): Promise<{ data: Product }> {
  return request<{ data: Product }>('/api/products', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'updatedAt'>>
): Promise<{ data: Product }> {
  return request<{ data: Product }>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export async function deleteProduct(id: number): Promise<void> {
  await request<void>(`/api/products/${id}`, { method: 'DELETE' })
}

export type ProductDetailResponse = {
  data: Product
  createdByUser: { username: string; displayName: string } | null
  createdAt: string | null
  history: Array<{
    byUser: { username: string; displayName: string }
    changedAt: string
    changes: Array<{ field: string; old: unknown; new: unknown }>
  }>
}

export async function getProductDetail(id: number): Promise<ProductDetailResponse> {
  return request<ProductDetailResponse>(`/api/products/${id}/detail`)
}

// --- 登入 API ---

export type AuthUser = {
  id: number
  username: string
  displayName: string
  role: string
  visibleFields?: string[] | null
  allowedOps?: string[] | null
}

export async function login(input: { username: string; password: string }): Promise<{
  user: AuthUser | null
}> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

export async function me(): Promise<{ user: AuthUser | null }> {
  return request('/api/auth/me')
}

// --- 管理員：用戶與權限 API ---

export type AdminUser = {
  id: number
  username: string
  displayName: string
  role: string
  visibleFields: string[] | null
  allowedOps: string[] | null
  createdBy: number | null
  isActive: boolean
  createdAt: string
}

export async function listAdminUsers(): Promise<{ data: AdminUser[] }> {
  return request('/api/admin/users')
}

export async function getAdminFields(): Promise<{ data: string[] }> {
  return request('/api/admin/users/fields')
}

export async function getAdminOps(): Promise<{ data: string[] }> {
  return request('/api/admin/users/ops')
}

export async function createAdminUser(input: {
  username: string
  password: string
  displayName: string
  role: 'viewer' | 'client'
  visibleFields?: string[]
  allowedOps?: string[]
}): Promise<{ data: AdminUser }> {
  return request('/api/admin/users', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateAdminUser(
  id: number,
  input: {
    displayName?: string
    password?: string
    role?: 'viewer' | 'client'
    visibleFields?: string[] | null
    allowedOps?: string[] | null
    isActive?: boolean
  }
): Promise<{ data: AdminUser }> {
  return request(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

