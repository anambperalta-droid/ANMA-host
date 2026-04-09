import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const { config } = useData()

  const c = config()
  const name = c.businessName || 'ANMA'

  const handleLogin = async () => {
    if (!email || !pass) { setErr('Completa todos los campos.'); return }
    setSubmitting(true)
    setErr('')
    const result = await login(email, pass)
    if (result) { setErr(result); setSubmitting(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin() }

  return (
    <div id="login-screen" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex' }}>
      <div className="login-left">
        <div className="login-hero">
          <div className="login-hero-logo">
            {c.logo ? <img src={c.logo} alt="" /> : name.slice(0, 2).toUpperCase()}
          </div>
          <h1>{name}</h1>
          <p>Tu negocio en un solo lugar</p>
          <div className="login-feature">
            <div className="login-feature-icon"><i className="fa fa-file-invoice-dollar" /></div>
            <div className="login-feature-text"><div className="t">Presupuestos y facturacion</div><div className="s">Crea, envia y hace seguimiento en segundos</div></div>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon"><i className="fa fa-chart-line" /></div>
            <div className="login-feature-text"><div className="t">Metricas en tiempo real</div><div className="s">Ventas, cobros, clientes y rentabilidad al dia</div></div>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon"><i className="fa fa-bell" /></div>
            <div className="login-feature-text"><div className="t">Alertas y recordatorios</div><div className="s">Nunca pierdas un seguimiento o un cobro pendiente</div></div>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon"><i className="fa fa-users" /></div>
            <div className="login-feature-text"><div className="t">Clientes y proveedores</div><div className="s">Toda tu red de contactos organizada y accesible</div></div>
          </div>
        </div>
      </div>
      <div className="login-right">
        <div className="login-form-wrap">
          <div className="login-form-brand">
            <h2>Bienvenido</h2>
            <p>Ingresa a tu cuenta {name}</p>
          </div>
          {err && (
            <div className="login-err" style={{ display: 'flex' }}>
              <i className="fa fa-circle-exclamation" /><span>{err}</span>
            </div>
          )}
          <div className="form-group fg">
            <label className="f-lbl">Email</label>
            <input type="email" className="f-inp" placeholder="tu@email.com" value={email}
              onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} autoComplete="email" />
          </div>
          <div className="form-group fg">
            <label className="f-lbl">Contraseña</label>
            <div className="f-wrap">
              <input type={showPwd ? 'text' : 'password'} className="f-inp" placeholder="********"
                value={pass} onChange={e => setPass(e.target.value)} onKeyDown={handleKey}
                autoComplete="current-password" style={{ paddingRight: 44 }} />
              <button className="eye-btn" type="button" onClick={() => setShowPwd(!showPwd)}>
                <i className={`fa ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>
          <button className="btn-login" onClick={handleLogin} disabled={submitting}
            style={{ opacity: submitting ? 0.6 : 1 }}>
            {submitting
              ? <><i className="fa fa-spinner fa-spin" /> Ingresando...</>
              : <><i className="fa fa-arrow-right-to-bracket" /> Ingresar</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
