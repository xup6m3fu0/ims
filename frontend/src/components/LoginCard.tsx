import { useState } from 'react'

export function LoginCard(props: {
  loading?: boolean
  error?: string | null
  onSubmit: (v: { username: string; password: string }) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="loginWrap">
      <div className="loginCard">
        <div className="loginTitle">管理員登入</div>
        <div className="loginSubtitle">請使用管理員帳號登入後台</div>

        <label className="field">
          <div className="label">帳號</div>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} disabled={props.loading} />
        </label>

        <label className="field">
          <div className="label">密碼</div>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={props.loading}
          />
        </label>

        {props.error ? <div className="errorBox">{props.error}</div> : null}

        <div className="loginBtnWrap">
          <button
            className="btn btnPrimary"
            onClick={() => props.onSubmit({ username, password })}
            disabled={props.loading || !username || !password}
          >
            {props.loading ? '登入中…' : '登入'}
          </button>
        </div>

        <div className="loginHint">
          預設帳號（可在資料庫自行改掉）：
          <div className="mono">admin / admin123</div>
          <div className="mono">viewer / viewer123</div>
        </div>
      </div>
    </div>
  )
}

