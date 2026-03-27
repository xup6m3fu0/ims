import { useEffect, useRef } from 'react'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (props.open) {
      if (!el.open) el.showModal()
    } else {
      if (el.open) el.close()
    }
  }, [props.open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        props.onCancel()
      }}
      className="dialog"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
        }}
      >
        <div className="dialogTitle">{props.title}</div>
        <div className="dialogMessage">{props.message}</div>
        <div className="dialogActions">
          <button type="button" className="btn" onClick={props.onCancel}>
            {props.cancelText ?? '取消'}
          </button>
          <button
            type="button"
            className={props.danger ? 'btn btnDanger' : 'btn btnPrimary'}
            onClick={props.onConfirm}
          >
            {props.confirmText ?? '確定'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

