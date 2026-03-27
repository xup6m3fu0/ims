import { useEffect, useMemo, useRef, useState } from 'react'
import type { Location, Product, Status } from '../types'

type Draft = {
  code: string
  customerName: string
  productName: string
  quantity: number
  location: Location
  status: Status
  note: string
}

const LOCATIONS: Location[] = ['A', 'B', 'C', 'D', 'E']
const STATUSES: Status[] = ['成品', '半成品', '不良品', '原料', '埋入件']

function toDraft(p?: Product | null): Draft {
  return {
    code: p?.code ?? '',
    customerName: p?.customerName ?? '',
    productName: p?.productName ?? '',
    quantity: p?.quantity ?? 0,
    location: p?.location ?? 'A',
    status: p?.status ?? '成品',
    note: p?.note ?? '',
  }
}

const FIELD_ORDER: (keyof Draft)[] = ['code', 'customerName', 'productName', 'quantity', 'location', 'status', 'note']

export type ProductDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  product?: Product | null
  /** 新增時建議的編號（依順位），可修改 */
  suggestedCode?: string | null
  submitting?: boolean
  error?: string | null
  visibleFields?: string[] | null
  onSubmit: (draft: Draft) => void
  onClose: () => void
}

export function ProductDialog(props: ProductDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(props.product))

  const title = useMemo(() => (props.mode === 'create' ? '新增產品' : '編輯產品'), [props.mode])

  const fieldsToShow = useMemo(() => {
    if (!props.visibleFields || props.visibleFields.length === 0) return FIELD_ORDER
    return FIELD_ORDER.filter((f) => props.visibleFields!.includes(f))
  }, [props.visibleFields])

  useEffect(() => {
    setDraft(toDraft(props.product))
  }, [props.product, props.open])

  useEffect(() => {
    if (props.mode === 'create' && props.suggestedCode) {
      setDraft((d) => ({ ...d, code: props.suggestedCode! }))
    }
  }, [props.mode, props.suggestedCode])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (props.open) {
      if (!el.open) el.showModal()
    } else {
      if (el.open) el.close()
    }
  }, [props.open])

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        props.onClose()
      }}
      className="dialog"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          props.onSubmit(draft)
        }}
      >
        <div className="dialogTitle">{title}</div>

        <div className="formGrid">
          {fieldsToShow.includes('code') && (
            <label className="field">
              <div className="label">編號</div>
              <input
                className="input"
                value={draft.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="例如：P-0001"
                disabled={props.submitting}
                required
              />
            </label>
          )}

          {fieldsToShow.includes('customerName') && (
            <label className="field">
              <div className="label">客戶名稱</div>
              <input
                className="input"
                value={draft.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                disabled={props.submitting}
                required
              />
            </label>
          )}

          {fieldsToShow.includes('productName') && (
            <label className="field">
              <div className="label">產品名稱</div>
              <input
                className="input"
                value={draft.productName}
                onChange={(e) => set('productName', e.target.value)}
                disabled={props.submitting}
                required
              />
            </label>
          )}

          {fieldsToShow.includes('quantity') && (
            <label className="field">
              <div className="label">庫存數量</div>
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={draft.quantity}
                onChange={(e) => set('quantity', Number(e.target.value))}
                disabled={props.submitting}
                required
              />
            </label>
          )}

          {fieldsToShow.includes('location') && (
            <label className="field">
              <div className="label">庫位</div>
              <select
                className="input"
                value={draft.location}
                onChange={(e) => set('location', e.target.value as Location)}
                disabled={props.submitting}
              >
                {LOCATIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}

          {fieldsToShow.includes('status') && (
            <label className="field">
              <div className="label">狀態</div>
              <select
                className="input"
                value={draft.status}
                onChange={(e) => set('status', e.target.value as Status)}
                disabled={props.submitting}
              >
                {STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}

          {fieldsToShow.includes('note') && (
            <label className="field fieldFull">
              <div className="label">備註</div>
              <textarea
                className="input textarea"
                value={draft.note}
                onChange={(e) => set('note', e.target.value)}
                disabled={props.submitting}
                rows={4}
              />
            </label>
          )}
        </div>

        {props.error ? <div className="errorBox">{props.error}</div> : null}

        <div className="dialogActions">
          <button type="button" className="btn" onClick={props.onClose} disabled={props.submitting}>
            取消
          </button>
          <button type="submit" className="btn btnPrimary" disabled={props.submitting}>
            {props.submitting ? '處理中…' : '儲存'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export type ProductDraft = Draft

