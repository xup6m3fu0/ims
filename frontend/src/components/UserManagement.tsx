import { useEffect, useState } from 'react'
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  getAdminFields,
  getAdminOps,
  type AdminUser,
} from '../api'
import { PRODUCT_FIELD_LABELS, PRODUCT_OP_LABELS } from '../constants'

type Page = 'list' | 'create' | 'edit'
type ClientForm = {
  username: string
  password: string
  displayName: string
  role: 'viewer' | 'client'
  visibleFields: string[]
  allowedOps: string[]
}

const emptyForm: ClientForm = {
  username: '',
  password: '',
  displayName: '',
  role: 'client',
  visibleFields: [],
  allowedOps: [],
}

export function UserManagement(props: { onBack: () => void }) {
  const [page, setPage] = useState<Page>('list')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [fields, setFields] = useState<string[]>([])
  const [ops, setOps] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<ClientForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [uRes, fRes, oRes] = await Promise.all([
          listAdminUsers(),
          getAdminFields(),
          getAdminOps(),
        ])
        setUsers(uRes.data)
        setFields(fRes.data)
        setOps(oRes.data)
      } catch (e: any) {
        setError(e?.message ?? '載入失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [page])

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setPage('create')
  }

  function openEdit(u: AdminUser) {
    if (u.role === 'admin') return
    setForm({
      username: u.username,
      password: '',
      displayName: u.displayName,
      role: (u.role === 'viewer' ? 'viewer' : 'client') as 'viewer' | 'client',
      visibleFields: u.visibleFields ?? [],
      allowedOps: u.allowedOps ?? [],
    })
    setEditingId(u.id)
    setPage('edit')
  }

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      await createAdminUser({
        username: form.username,
        password: form.password,
        displayName: form.displayName,
        role: form.role,
        visibleFields: form.role === 'client' ? form.visibleFields : undefined,
        allowedOps: form.role === 'client' ? form.allowedOps : form.role === 'viewer' ? ['list'] : undefined,
      })
      setPage('list')
      const res = await listAdminUsers()
      setUsers(res.data)
    } catch (e: any) {
      setError(e?.message ?? '新增失敗')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (editingId == null) return
    setSubmitting(true)
    setError(null)
    try {
      await updateAdminUser(editingId, {
        displayName: form.displayName,
        password: form.password || undefined,
        role: form.role,
        visibleFields: form.role === 'client' ? form.visibleFields : null,
        allowedOps: form.role === 'client' ? form.allowedOps : form.role === 'viewer' ? ['list'] : null,
      })
      setPage('list')
      const res = await listAdminUsers()
      setUsers(res.data)
    } catch (e: any) {
      setError(e?.message ?? '更新失敗')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleField(f: string) {
    setForm((prev) => ({
      ...prev,
      visibleFields: prev.visibleFields.includes(f)
        ? prev.visibleFields.filter((x) => x !== f)
        : [...prev.visibleFields, f],
    }))
  }

  function toggleOp(o: string) {
    setForm((prev) => ({
      ...prev,
      allowedOps: prev.allowedOps.includes(o)
        ? prev.allowedOps.filter((x) => x !== o)
        : [...prev.allowedOps, o],
    }))
  }

  if (page === 'create' || page === 'edit') {
    return (
      <div className="panel">
        <div className="header" style={{ marginBottom: 16 }}>
          <button type="button" className="btn" onClick={() => setPage('list')}>
            返回
          </button>
          <span className="title" style={{ marginLeft: 12 }}>
            {page === 'create' ? '新增用戶端' : '編輯用戶端'}
          </span>
        </div>

        <div className="formGrid" style={{ gridTemplateColumns: '1fr', maxWidth: 560 }}>
          <label className="field">
            <div className="label">帳號</div>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              disabled={page === 'edit'}
              placeholder="登入用帳號"
            />
          </label>
          <label className="field">
            <div className="label">密碼 {page === 'edit' && '(留空不變)'}</div>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              disabled={submitting}
              placeholder={page === 'edit' ? '不修改請留空' : '請設定密碼'}
            />
          </label>
          <label className="field">
            <div className="label">顯示名稱</div>
            <input
              className="input"
              value={form.displayName}
              onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
              disabled={submitting}
            />
          </label>
          <label className="field">
            <div className="label">角色</div>
            <select
              className="input"
              value={form.role}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  role: e.target.value as 'viewer' | 'client',
                  visibleFields: e.target.value === 'viewer' ? [] : p.visibleFields,
                  allowedOps: e.target.value === 'viewer' ? ['list'] : p.allowedOps,
                }))
              }
              disabled={submitting}
            >
              <option value="viewer">僅查詢 (viewer)</option>
              <option value="client">自訂權限 (client)</option>
            </select>
          </label>

          {form.role === 'client' && (
            <>
              <div className="field fieldFull">
                <div className="label">可見欄位</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {fields.map((f) => (
                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={form.visibleFields.includes(f)}
                        onChange={() => toggleField(f)}
                        disabled={submitting}
                      />
                      <span>{PRODUCT_FIELD_LABELS[f] ?? f}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field fieldFull">
                <div className="label">允許操作</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {ops.map((o) => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={form.allowedOps.includes(o)}
                        onChange={() => toggleOp(o)}
                        disabled={submitting}
                      />
                      <span>{PRODUCT_OP_LABELS[o] ?? o}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {error && <div className="alert alertError">{error}</div>}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setPage('list')} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={page === 'create' ? handleCreate : handleUpdate}
            disabled={
              submitting ||
              !form.username.trim() ||
              !form.displayName.trim() ||
              (page === 'create' && !form.password)
            }
          >
            {submitting ? '處理中…' : page === 'create' ? '新增' : '儲存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="header" style={{ marginBottom: 16 }}>
        <button type="button" className="btn" onClick={props.onBack}>
          返回產品列表
        </button>
        <span className="title" style={{ marginLeft: 12 }}>
          用戶與權限管理
        </span>
        <button type="button" className="btn btnPrimary" onClick={openCreate}>
          新增用戶端
        </button>
      </div>

      {error && <div className="alert alertError">{error}</div>}

      {loading ? (
        <div className="muted">載入中…</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>顯示名稱</th>
                <th>角色</th>
                <th>可見欄位</th>
                <th>允許操作</th>
                <th>狀態</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.displayName}</td>
                  <td>{u.role}</td>
                  <td className="note">
                    {u.role === 'client' && u.visibleFields?.length
                      ? u.visibleFields.map((f) => PRODUCT_FIELD_LABELS[f] ?? f).join('、')
                      : u.role === 'viewer'
                        ? '全部'
                        : '—'}
                  </td>
                  <td className="note">
                    {u.allowedOps?.length ? u.allowedOps.map((o) => PRODUCT_OP_LABELS[o] ?? o).join('、') : '—'}
                  </td>
                  <td>{u.isActive ? '啟用' : '停用'}</td>
                  <td className="actions">
                    {u.role !== 'admin' && (
                      <button type="button" className="btn btnSmall" onClick={() => openEdit(u)}>
                        編輯
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
