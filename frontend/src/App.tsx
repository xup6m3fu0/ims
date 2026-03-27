import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { Location, Product, Status } from './types'
import type { AuthUser } from './api'
import {
  createProduct,
  deleteProduct,
  getProductDetail,
  listProducts,
  getCustomerNames,
  login,
  logout,
  me,
  suggestProductCode,
  updateProduct,
} from './api'
import type { ProductDetailResponse } from './api'
import { ProductDialog, type ProductDraft } from './components/ProductDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { LoginCard } from './components/LoginCard'
import { UserManagement } from './components/UserManagement'
import { PRODUCT_FIELD_LABELS } from './constants'

const DEFAULT_COLUMNS = ['code', 'customerName', 'productName', 'quantity', 'location', 'status', 'note', 'updatedAt']

/** 列表「最後修改日期」僅顯示 yyyy/mm/dd */
function formatDateOnly(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

/** 詳情頁與修改紀錄顯示完整日期時間（24 小時制，含分） */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

function canOp(user: AuthUser | null, op: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (!user.allowedOps || user.allowedOps.length === 0) return false
  return user.allowedOps.includes(op)
}

function visibleColumns(user: AuthUser | null): string[] {
  if (!user?.visibleFields || user.visibleFields.length === 0) return DEFAULT_COLUMNS
  return user.visibleFields.filter((f) => DEFAULT_COLUMNS.includes(f) || f === 'id')
}

function App() {
  // 登入狀態
  const [booting, setBooting] = useState(true)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [view, setView] = useState<'products' | 'users'>('products')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // 列表篩選與分頁
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [filterCustomerName, setFilterCustomerName] = useState('')
  const [customerNames, setCustomerNames] = useState<string[]>([])
  const [location, setLocation] = useState<Location | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState<
    'updatedAt_desc' | 'updatedAt_asc' | 'code_asc' | 'code_desc'
  >('updatedAt_desc')

  // 列表資料
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Product[]>([])
  const [total, setTotal] = useState(0)

  // 新增/編輯對話框
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [selected, setSelected] = useState<Product | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // 刪除確認對話框
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)

  // 產品詳情頁（建立者 + 修改紀錄）
  const [detailProductId, setDetailProductId] = useState<number | null>(null)
  const [detailData, setDetailData] = useState<ProductDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /** 新增時建議的編號（依順位 P-0001, P-0002...） */
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null)

  /** 展開頁「出入庫」對話框（僅改數量） */
  const [inOutOpen, setInOutOpen] = useState(false)
  const [inOutQuantity, setInOutQuantity] = useState(0)
  const [inOutSubmitting, setInOutSubmitting] = useState(false)
  const inOutDialogRef = useRef<HTMLDialogElement>(null)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  )

  const columns = useMemo(() => visibleColumns(authUser), [authUser])
  /** 列表不顯示編號欄位 */
  const listColumns = useMemo(() => columns.filter((c) => c !== 'code'), [columns])
  const canCreate = canOp(authUser, 'create')
  const canUpdate = canOp(authUser, 'update')
  const canDelete = canOp(authUser, 'delete')

  useEffect(() => {
    ;(async () => {
      try {
        const r = await me()
        setAuthUser(r.user)
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await listProducts({
        q,
        customerName: filterCustomerName || undefined,
        status,
        location,
        page,
        pageSize,
        sort,
      })
      setRows(res.data)
      setTotal(res.total)
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('unauthorized') || msg.includes('HTTP 401') || msg.includes('forbidden') || msg.includes('HTTP 403')) {
        setAuthUser(null)
        setError(null)
      } else {
        setError(e?.message ?? '載入失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authUser) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, q, filterCustomerName, status, location, page, pageSize, sort])

  useEffect(() => {
    if (!authUser) return
    getCustomerNames()
      .then((res) => setCustomerNames(res.customers))
      .catch(() => setCustomerNames([]))
  }, [authUser])

  useEffect(() => {
    if (detailProductId == null) return
    setDetailLoading(true)
    getProductDetail(detailProductId)
      .then(setDetailData)
      .catch(() => setDetailData(null))
      .finally(() => setDetailLoading(false))
  }, [detailProductId])

  useEffect(() => {
    const el = inOutDialogRef.current
    if (!el) return
    if (inOutOpen) {
      if (!el.open) el.showModal()
    } else {
      if (el.open) el.close()
    }
  }, [inOutOpen])

  function openCreate() {
    setDialogMode('create')
    setSelected(null)
    setFormError(null)
    setSuggestedCode(null)
    setDialogOpen(true)
  }

  useEffect(() => {
    if (dialogOpen && dialogMode === 'create' && canCreate) {
      suggestProductCode()
        .then((r) => setSuggestedCode(r.code))
        .catch(() => setSuggestedCode(null))
    } else {
      setSuggestedCode(null)
    }
  }, [dialogOpen, dialogMode, canCreate])

  function openEdit(p: Product) {
    setDialogMode('edit')
    setSelected(p)
    setFormError(null)
    setDialogOpen(true)
  }

  function openDetail(p: Product) {
    setDetailProductId(p.id)
    setDetailData(null)
  }

  async function submitInOut() {
    if (detailProductId == null) return
    setInOutSubmitting(true)
    try {
      const qty = Number(inOutQuantity)
      if (!Number.isInteger(qty) || qty < 0) {
        return
      }
      await updateProduct(detailProductId, { quantity: qty })
      setInOutOpen(false)
      const next = await getProductDetail(detailProductId)
      setDetailData(next)
    } catch {
      // 可依需求顯示錯誤
    } finally {
      setInOutSubmitting(false)
    }
  }

  async function onSubmit(draft: ProductDraft) {
    setSubmitting(true)
    setFormError(null)
    try {
      if (dialogMode === 'create') {
        await createProduct(draft)
      } else if (selected) {
        await updateProduct(selected.id, draft)
      }
      setDialogOpen(false)
      await refresh()
      if (dialogMode === 'edit' && selected && detailProductId === selected.id) {
        const next = await getProductDetail(detailProductId)
        setDetailData(next)
      }
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('unauthorized') || msg.includes('HTTP 401') || msg.includes('forbidden') || msg.includes('HTTP 403')) {
        setAuthUser(null)
        setDialogOpen(false)
      } else {
        setFormError(e?.message ?? '儲存失敗')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function askDelete(p: Product) {
    setDeleting(p)
    setConfirmOpen(true)
  }

  async function doDelete() {
    if (!deleting) return
    const idToDelete = deleting.id
    setSubmitting(true)
    try {
      await deleteProduct(idToDelete)
      setConfirmOpen(false)
      setDeleting(null)
      if (detailProductId === idToDelete) {
        setDetailProductId(null)
        setDetailData(null)
      }
      await refresh()
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('unauthorized') || msg.includes('HTTP 401') || msg.includes('forbidden') || msg.includes('HTTP 403')) {
        setAuthUser(null)
        setConfirmOpen(false)
        setDeleting(null)
      } else {
        setError(e?.message ?? '刪除失敗')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function doLogin(v: { username: string; password: string }) {
    setAuthLoading(true)
    setAuthError(null)
    try {
      await login(v)
      // 登入後重整頁面，確保後續請求（me、listProducts）會帶上新設定的 cookie，
      // 避免 admin 剛改完客戶端權限後第一次登入仍帶舊 token 而出現 403
      window.location.reload()
    } catch (e: any) {
      setAuthError(e?.message ?? '登入失敗')
      setAuthLoading(false)
    }
  }

  async function doLogout() {
    setAuthLoading(true)
    try {
      await logout()
      setAuthUser(null)
    } finally {
      setAuthLoading(false)
    }
  }

  if (booting) {
    return (
      <div className="page">
        <div className="panel muted">載入中…</div>
      </div>
    )
  }

  if (!authUser) {
    return <LoginCard loading={authLoading} error={authError} onSubmit={doLogin} />
  }

  if (view === 'users') {
    return (
      <div className="page">
        <header className="header">
          <div>
            <div className="title">倉儲管理系統（後台）</div>
            <div className="subtitle">用戶與權限管理</div>
          </div>
          <div className="headerActions">
            <div className="userBadge">
              {authUser.displayName}（{authUser.username}）
            </div>
            <button className="btn" onClick={doLogout} disabled={authLoading}>
              登出
            </button>
          </div>
        </header>
        <UserManagement onBack={() => setView('products')} />
      </div>
    )
  }

  if (detailProductId != null) {
    const d = detailData?.data
    return (
      <div className="page">
        <header className="header">
          <div>
            <div className="title">倉儲管理系統（後台）</div>
            <div className="subtitle">產品資料展開</div>
          </div>
          <div className="headerActions">
            <div className="userBadge">
              {authUser.displayName}（{authUser.username}）
            </div>
            {authUser.role === 'admin' && (
              <button type="button" className="btn" onClick={() => setView('users')}>
                用戶管理
              </button>
            )}
            <button className="btn" onClick={doLogout} disabled={authLoading}>
              登出
            </button>
          </div>
        </header>

        <section className="panel detailPagePanel">
          <div className="header" style={{ marginBottom: 24 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDetailProductId(null)
                setDetailData(null)
                refresh()
              }}
            >
              返回列表
            </button>
            <span className="title" style={{ marginLeft: 12 }}>{d?.productName ?? '產品資料'}</span>
            {!detailLoading && detailData && d && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {canUpdate && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setInOutQuantity(typeof d.quantity === 'number' ? d.quantity : 0)
                        setInOutOpen(true)
                      }}
                    >
                      出入庫
                    </button>
                    <button type="button" className="btn btnPrimary" onClick={() => openEdit(d as Product)}>
                      編輯
                    </button>
                  </>
                )}
                {canDelete && (
                  <button type="button" className="btn btnDanger" onClick={() => askDelete(d as Product)}>
                    刪除
                  </button>
                )}
              </div>
            )}
          </div>

          {detailLoading && <div className="muted">載入中…</div>}

          {!detailLoading && detailData && d && (
            <>
              <div className="detailSection">
                <div className="detailSectionTitle">基本資料</div>
                <div className="detailFields">
                  {(['id', 'code', 'customerName', 'productName', 'quantity', 'location', 'status', 'note', 'updatedAt'] as const).map((col) => {
                    if (col === 'updatedAt') {
                      if (d.updatedAt == null) return null
                      return (
                        <div key={col} className="detailField">
                          <div className="detailFieldLabel">{PRODUCT_FIELD_LABELS[col] ?? col}</div>
                          <div className="detailFieldValue mono">{formatDateOnly(d.updatedAt)}</div>
                        </div>
                      )
                    }
                    if (d[col] === undefined || d[col] === null) return null
                    return (
                      <div key={col} className="detailField">
                        <div className="detailFieldLabel">{PRODUCT_FIELD_LABELS[col] ?? col}</div>
                        <div className={`detailFieldValue ${col === 'quantity' || col === 'code' || col === 'location' ? 'mono' : ''}`}>
                          {(d as any)[col]}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="detailSection">
                <div className="detailSectionTitle">建立資訊</div>
                <div className="detailCreator">
                  {detailData.createdByUser ? (
                    <span>{detailData.createdByUser.displayName}（{detailData.createdByUser.username}）</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                  {detailData.createdAt && (
                    <span className="detailCreatorTime">建立時間 {formatDateTime(detailData.createdAt)}</span>
                  )}
                </div>
              </div>

              <div className="detailSection">
                <div className="detailSectionTitle">修改紀錄</div>
                {detailData.history.length === 0 ? (
                  <div className="detailHistoryEmpty">尚無修改紀錄</div>
                ) : (
                  <ul className="detailHistoryList">
                    {detailData.history.map((h, i) => (
                      <li key={i} className="detailHistoryItem">
                        <div className="detailHistoryMeta">
                          {h.byUser.displayName}（{h.byUser.username}） · {formatDateTime(h.changedAt)}
                        </div>
                        <div className="detailHistoryChanges">
                          {h.changes.map((c, j) => (
                            <span key={j} className="detailHistoryChange">
                              <span className="detailHistoryChangeLabel">{PRODUCT_FIELD_LABELS[c.field] ?? c.field}</span>
                              <span className="detailHistoryChangeValues">
                                {String(c.old ?? '—')} → {String(c.new ?? '—')}
                              </span>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {!detailLoading && !detailData && <div className="muted">無法載入資料</div>}
        </section>

        <dialog
          ref={inOutDialogRef}
          className="dialog"
          onCancel={(e) => { e.preventDefault(); setInOutOpen(false) }}
        >
          <form
            method="dialog"
            onSubmit={(e) => { e.preventDefault(); submitInOut() }}
          >
            <div className="dialogTitle">出入庫（僅更改數量）</div>
            <div style={{ padding: '14px 16px' }}>
              <label className="field">
                <div className="label">庫存數量</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={inOutQuantity}
                  onChange={(e) => setInOutQuantity(Number(e.target.value) || 0)}
                  disabled={inOutSubmitting}
                />
              </label>
            </div>
            <div className="dialogActions">
              <button type="button" className="btn" onClick={() => setInOutOpen(false)} disabled={inOutSubmitting}>
                取消
              </button>
              <button type="button" className="btn btnPrimary" onClick={() => submitInOut()} disabled={inOutSubmitting}>
                {inOutSubmitting ? '儲存中…' : '儲存'}
              </button>
            </div>
          </form>
        </dialog>

        <ProductDialog
          open={dialogOpen}
          mode={dialogMode}
          product={selected}
          {...(dialogMode === 'create' && { suggestedCode })}
          submitting={submitting}
          error={formError}
          visibleFields={authUser.visibleFields ?? undefined}
          onSubmit={onSubmit}
          onClose={() => setDialogOpen(false)}
        />

        <ConfirmDialog
          open={confirmOpen}
          title="是否要刪除？"
          message={deleting ? `是否要刪除「${deleting.code}」？刪除後無法復原。` : '是否要刪除？刪除後無法復原。'}
          confirmText={submitting ? '處理中…' : '確認刪除'}
          cancelText="取消"
          danger
          onCancel={() => {
            if (submitting) return
            setConfirmOpen(false)
            setDeleting(null)
          }}
          onConfirm={() => {
            if (submitting) return
            doDelete()
          }}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">倉儲管理系統（後台）</div>
          <div className="subtitle">React + SQLite（本機測試版）</div>
        </div>
        <div className="headerActions">
          <div className="userBadge">
            {authUser.displayName}（{authUser.username}）
          </div>
          {authUser.role === 'admin' && (
            <button type="button" className="btn" onClick={() => setView('users')}>
              用戶管理
            </button>
          )}
          <button className="btn" onClick={doLogout} disabled={authLoading}>
            登出
          </button>
          {canCreate && (
            <button className="btn btnPrimary" onClick={openCreate}>
              新增
            </button>
          )}
        </div>
      </header>

      <section className="panel">
        <div className="filters">
          <label className="filter">
            <div className="labelSmall">搜尋</div>
            <input
              className="input"
              value={q}
              onChange={(e) => {
                setPage(1)
                setQ(e.target.value)
              }}
              placeholder="編號 / 客戶 / 產品 / 備註"
            />
          </label>

          <label className="filter">
            <div className="labelSmall">客戶名稱</div>
            <select
              className="input"
              value={filterCustomerName}
              onChange={(e) => {
                setPage(1)
                setFilterCustomerName(e.target.value)
              }}
            >
              <option value="">全部</option>
              {customerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter">
            <div className="labelSmall">庫位</div>
            <select
              className="input"
              value={location}
              onChange={(e) => {
                setPage(1)
                setLocation(e.target.value as any)
              }}
            >
              <option value="">全部</option>
              {(['A', 'B', 'C', 'D', 'E'] as Location[]).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="filter">
            <div className="labelSmall">狀態</div>
            <select
              className="input"
              value={status}
              onChange={(e) => {
                setPage(1)
                setStatus(e.target.value as any)
              }}
            >
              <option value="">全部</option>
              {(['成品', '半成品', '不良品', '原料', '埋入件'] as Status[]).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="filter">
            <div className="labelSmall">排序</div>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="updatedAt_desc">修改日期（新→舊）</option>
              <option value="updatedAt_asc">修改日期（舊→新）</option>
              <option value="code_asc">編號（小→大）</option>
              <option value="code_desc">編號（大→小）</option>
            </select>
          </label>
        </div>

        {error ? <div className="alert alertError">{error}</div> : null}

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                {listColumns.map((col) => (
                  <th
                    key={col}
                    className={
                      col === 'quantity'
                        ? 'num'
                        : col === 'productName'
                          ? 'colProductName'
                          : col === 'updatedAt'
                            ? 'colUpdatedAt'
                            : ''
                    }
                  >
                    {PRODUCT_FIELD_LABELS[col] ?? col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={listColumns.length} className="muted">
                    載入中…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((p) => (
                  <tr key={p.id} className="rowClickable" onClick={() => openDetail(p)}>
                    {listColumns.map((col) => (
                      <td
                        key={col}
                        data-label={PRODUCT_FIELD_LABELS[col] ?? col}
                        className={
                          col === 'quantity' || col === 'location' || col === 'updatedAt'
                            ? 'mono ' + (col === 'quantity' ? 'num' : col === 'updatedAt' ? 'colUpdatedAt' : '')
                            : col === 'note'
                              ? 'note'
                              : col === 'productName'
                                ? 'colProductName'
                                : ''
                        }
                      >
                        {col === 'updatedAt' && p.updatedAt
                          ? formatDateTime(p.updatedAt)
                          : (p as any)[col]}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={listColumns.length} className="muted">
                    沒有資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <div className="pagerLeft">
            <span className="muted">
              共 <span className="mono">{total}</span> 筆
            </span>
          </div>
          <div className="pagerRight">
            <select className="input inputSmall" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / 頁
                </option>
              ))}
            </select>
            <button className="btn btnSmall" onClick={() => setPage(1)} disabled={page <= 1}>
              第一頁
            </button>
            <button className="btn btnSmall" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              上一頁
            </button>
            <span className="mono">
              {page} / {totalPages}
            </span>
            <button
              className="btn btnSmall"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              下一頁
            </button>
            <button className="btn btnSmall" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
              最後頁
            </button>
          </div>
        </div>
      </section>

      <ProductDialog
        open={dialogOpen}
        mode={dialogMode}
        product={selected}
        {...(dialogMode === 'create' && { suggestedCode })}
        submitting={submitting}
        error={formError}
        visibleFields={authUser.visibleFields ?? undefined}
        onSubmit={onSubmit}
        onClose={() => setDialogOpen(false)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="是否要刪除？"
        message={deleting ? `是否要刪除「${deleting.code}」？刪除後無法復原。` : '是否要刪除？刪除後無法復原。'}
        confirmText={submitting ? '處理中…' : '確認刪除'}
        cancelText="取消"
        danger
        onCancel={() => {
          if (submitting) return
          setConfirmOpen(false)
          setDeleting(null)
        }}
        onConfirm={() => {
          if (submitting) return
          doDelete()
        }}
      />
    </div>
  )
}

export default App
