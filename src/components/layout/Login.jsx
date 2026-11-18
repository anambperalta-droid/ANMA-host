import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const APP_VERSION = 'v1.4'
const APP_YEAR = new Date().getFullYear()
const LS_EMAIL_KEY = 'anma_last_email'
const LS_LAST_LOGIN = 'anma_last_login'

function friendlyAuthError(raw) {
  if (!raw) return ''
  const m = String(raw).toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Email o contraseña incorrectos. Probá de nuevo.'
  if (m.includes('email not confirmed')) return 'Tu email aún no está confirmado. Revisá tu bandeja.'
  if (m.includes('too many') || m.includes('rate')) return 'Demasiados intentos. Esperá unos minutos y volvé a probar.'
  if (m.includes('network') || m.includes('failed to fetch')) return 'Sin conexión. Revisá tu internet e intentá de nuevo.'
  if (m.includes('user not found')) return 'No encontramos una cuenta con ese email.'
  return raw
}

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return 'Trabajando tarde'
  if (h < 13) return 'Buen día'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function relativeDays(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'hoy'
  if (days < 2) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} sem.`
  return `hace ${Math.floor(days / 30)} m.`
}

export default function Login() {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(LS_EMAIL_KEY) || '' } catch { return '' }
  })
  const [pass, setPass] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const { login, signup, resetPassword } = useAuth()
  const [isSignup, setIsSignup] = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  const lastLogin = (() => { try { return localStorage.getItem(LS_LAST_LOGIN) } catch { return null } })()
  const lastLoginRel = relativeDays(lastLogin)

  useEffect(() => {
    try { if (email && email.includes('@')) localStorage.setItem(LS_EMAIL_KEY, email) } catch { /* ignorar */ }
  }, [email])

  const [forgotModal, setForgotModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetErr, setResetErr] = useState('')

  const handleLogin = async () => {
    if (!email || !pass) { setErr('Completá email y contraseña para continuar.'); return }
    const { validateEmail } = await import('../../lib/validate')
    const ev = validateEmail(email)
    if (!ev.ok) { setErr(ev.msg); return }
    setSubmitting(true); setErr('')

    if (isSignup) {
      if (pass.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); setSubmitting(false); return }
      const result = await signup(email, pass)
      if (result === '__confirm__') { setSignupDone(true); setSubmitting(false); return }
      if (result) { setErr(friendlyAuthError(result)); setSubmitting(false); return }
      try { localStorage.setItem(LS_LAST_LOGIN, new Date().toISOString()) } catch { /* ignorar */ }
      return
    }

    const result = await login(email, pass)
    if (result) { setErr(friendlyAuthError(result)); setSubmitting(false); return }
    try { localStorage.setItem(LS_LAST_LOGIN, new Date().toISOString()) } catch { /* ignorar */ }
  }

  const handleKey = (e) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
    if (e.key === 'Enter') handleLogin()
  }

  const openForgot = () => { setResetEmail(email); setResetSent(false); setResetErr(''); setForgotModal(true) }

  // Rate limiting client-side: cooldown 60s + bloqueo 5min después de 3 intentos
  const RESET_RL_KEY = 'anma_reset_rl'
  const checkResetRateLimit = () => {
    try {
      const raw = localStorage.getItem(RESET_RL_KEY)
      const data = raw ? JSON.parse(raw) : { attempts: [], blockedUntil: 0 }
      const now = Date.now()
      if (data.blockedUntil && data.blockedUntil > now) {
        const mins = Math.ceil((data.blockedUntil - now) / 60000)
        return { ok: false, msg: `Demasiados intentos. Esperá ${mins} min${mins !== 1 ? 's' : ''} antes de volver a probar.` }
      }
      data.attempts = (data.attempts || []).filter(t => now - t < 5 * 60000)
      const last = data.attempts[data.attempts.length - 1]
      if (last && now - last < 60000) {
        const secs = Math.ceil((60000 - (now - last)) / 1000)
        return { ok: false, msg: `Esperá ${secs}s antes de pedir otro enlace.` }
      }
      return { ok: true }
    } catch { return { ok: true } }
  }
  const recordResetAttempt = () => {
    try {
      const raw = localStorage.getItem(RESET_RL_KEY)
      const data = raw ? JSON.parse(raw) : { attempts: [], blockedUntil: 0 }
      const now = Date.now()
      data.attempts = [...(data.attempts || []).filter(t => now - t < 5 * 60000), now]
      if (data.attempts.length >= 3) { data.blockedUntil = now + 5 * 60000; data.attempts = [] }
      localStorage.setItem(RESET_RL_KEY, JSON.stringify(data))
    } catch { /* ignorar */ }
  }

  const handleReset = async () => {
    if (!resetEmail) { setResetErr('Ingresá tu email.'); return }
    const { validateEmail } = await import('../../lib/validate')
    const ve = validateEmail(resetEmail)
    if (!ve.ok) { setResetErr(ve.msg); return }
    const rl = checkResetRateLimit()
    if (!rl.ok) { setResetErr(rl.msg); return }
    setResetSending(true); setResetErr('')
    try {
      await resetPassword(resetEmail)
      recordResetAttempt()
      setResetSent(true)
    }
    catch (e) { setResetErr(e.message || 'Error al enviar. Verificá el email.') }
    setResetSending(false)
  }

  const knownName = (() => {
    if (!email || !email.includes('@')) return null
    const local = email.split('@')[0].split('.')[0].split('+')[0]
    if (!local || local.length < 2) return null
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
  })()

  return (
    <>
      <style>{`
        /* ═══════════════════════════════════════════════════════
           LA ENTRADA
           Era un degrade de magenta, violeta y ambar con tres orbes
           borrosos, grano y cuatro emojis flotando. Ahora: el rosa
           profundo de la marca (#831843) con el corte diagonal en
           la tinta de la casa (#1F1338), planos los dos, y tres
           baldosas de color como unico adorno. La tarjeta va en el
           rosa muy claro de los fondos suaves, con los campos en
           blanco adentro.
           ═══════════════════════════════════════════════════════ */

        @keyframes lpr-card-in { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes lpr-fade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

        .lpr-wrap{
          position:fixed;inset:0;z-index:9999;
          display:flex;align-items:center;justify-content:center;
          padding:24px;font-family:'Inter',system-ui,sans-serif;
          background:#831843;
          /* Scroll, no recorte: con el teclado abierto o en apaisado la
             tarjeta es mas alta que la pantalla y antes se cortaba el pie. */
          overflow:auto;-webkit-overflow-scrolling:touch;
        }
        .lpr-wrap::after{
          content:'';position:fixed;top:0;left:0;right:0;height:5px;
          background:#FBCFE8;pointer-events:none;
        }

        .lpr-card{
          position:relative;z-index:1;width:100%;max-width:480px;margin:auto;
          background:#FDF2F8;
          border:1px solid #F0D5E3;
          border-radius:26px;padding:40px 38px 30px;
          box-shadow:0 30px 70px -24px rgba(20,4,22,.6);
          animation:lpr-card-in .5s cubic-bezier(.2,.7,.2,1) both;
        }

        .lpr-top{display:flex;align-items:center;gap:12px;margin-bottom:22px}
        .lpr-logo{
          width:44px;height:44px;border-radius:13px;flex-shrink:0;
          background:#E11D74;
          display:flex;align-items:center;justify-content:center;
          font-size:19px;font-weight:800;color:#fff;letter-spacing:-.5px;
        }
        .lpr-brand-txt{display:flex;flex-direction:column;line-height:1}
        .lpr-brand-name{font-size:19px;font-weight:800;color:#1F1338;letter-spacing:-.5px}
        .lpr-brand-name span{color:#BE185D}
        .lpr-brand-tag{font-size:11px;color:#6B5B8C;margin-top:4px;letter-spacing:.3px}

        .lpr-greet{
          font-size:26px;font-weight:800;color:#1F1338;letter-spacing:-.5px;line-height:1.2;
          margin-bottom:8px;animation:lpr-fade .5s .1s ease both
        }
        .lpr-greet em{font-style:normal;color:#BE185D}
        .lpr-sub{
          font-size:13.5px;color:#6B5B8C;margin-bottom:24px;line-height:1.55;
          animation:lpr-fade .5s .18s ease both
        }
        .lpr-sub b{color:#1F1338;font-weight:700}

        .lpr-fg{margin-bottom:16px}
        .lpr-lbl{
          display:flex;justify-content:space-between;align-items:center;
          font-size:10.5px;font-weight:700;color:#6B5B8C;
          margin-bottom:7px;letter-spacing:.7px;text-transform:uppercase
        }
        .lpr-inp{
          width:100%;padding:15px 16px;box-sizing:border-box;
          background:#fff;
          border:1.5px solid #9D5B8C;
          border-radius:13px;font-size:15px;color:#1F1338;outline:none;
          transition:border-color .18s,box-shadow .18s;
          font-family:'Inter',sans-serif;
        }
        .lpr-inp::placeholder{color:#9D5B8C}
        .lpr-inp:focus{
          border-color:#BE185D;
          box-shadow:0 0 0 4px rgba(190,24,93,.14);
        }
        .lpr-pw{position:relative}
        .lpr-eye{
          position:absolute;right:8px;top:50%;transform:translateY(-50%);
          background:none;border:none;color:#6B5B8C;
          font-size:13px;cursor:pointer;transition:color .15s;
          width:38px;height:38px;display:flex;align-items:center;justify-content:center;
        }
        .lpr-eye:hover{color:#1F1338}

        .lpr-forgot{
          background:none;border:none;color:#BE185D;font-size:11px;font-weight:700;
          cursor:pointer;padding:0;font-family:inherit;letter-spacing:.2px;
          transition:color .15s;text-transform:none
        }
        .lpr-forgot:hover{color:#9D174D;text-decoration:underline}

        .lpr-err{
          background:#FDECEC;border:1.5px solid #F4CDCA;border-radius:11px;
          color:#B42318;font-size:12.5px;padding:11px 13px;margin-bottom:14px;
          display:flex;align-items:center;gap:8px;animation:lpr-fade .25s ease both;
        }
        .lpr-caps{display:flex;align-items:center;gap:6px;margin-top:7px;font-size:10.5px;color:#7A4F00;font-weight:700}

        .lpr-btn{
          width:100%;padding:16px;margin-top:10px;min-height:52px;
          background:#BE185D;
          color:#fff;border:none;border-radius:13px;
          font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;
          box-shadow:0 8px 20px rgba(190,24,93,.26);
          transition:background .18s,transform .15s,box-shadow .2s;
          display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:.2px;
        }
        .lpr-btn:hover:not(:disabled){background:#9D174D;transform:translateY(-1px);box-shadow:0 12px 26px rgba(190,24,93,.32)}
        .lpr-btn:active:not(:disabled){transform:translateY(0)}
        .lpr-btn:disabled{opacity:.55;cursor:not-allowed}

        .lpr-divider{
          display:flex;align-items:center;gap:10px;
          margin:20px 0 14px;font-size:10.5px;color:#6B5B8C;
          text-transform:uppercase;letter-spacing:1.2px;font-weight:700
        }
        .lpr-divider::before,.lpr-divider::after{content:'';flex:1;height:1px;background:#F0D5E3}

        .lpr-cta{
          display:flex;align-items:center;justify-content:center;gap:6px;
          width:100%;padding:12px;box-sizing:border-box;
          border:1.5px solid #E5B9D2;background:#FCE7F3;border-radius:12px;
          color:#9D174D;font-size:12.5px;font-weight:600;
          text-decoration:none;transition:background .18s,border-color .18s,transform .15s;
        }
        .lpr-cta:hover{background:#FBCFE8;border-color:#C98FB0;transform:translateY(-1px)}
        .lpr-cta-pill{
          font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;
          background:#FBCFE8;color:#831843;padding:3px 7px;border-radius:8px;margin-right:4px
        }

        .lpr-foot{
          margin-top:18px;text-align:center;font-size:10.5px;color:#6B5B8C;
          letter-spacing:.4px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap
        }
        .lpr-foot i{color:#0B7D59}
        .lpr-foot b{color:#4A3E63;font-weight:700}
        .lpr-foot a{color:#BE185D;text-decoration:none}
        .lpr-foot a:hover{text-decoration:underline}
        .lpr-dot{width:3px;height:3px;border-radius:50%;background:#E5B9D2;display:inline-block}

        /* MODAL: RECUPERAR CONTRASENA */
        .lpr-modal-bg{
          position:fixed;inset:0;z-index:10000;background:rgba(31,19,56,.62);
          display:flex;align-items:center;justify-content:center;padding:20px;
          -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
        }
        .lpr-modal{
          background:#FDF2F8;border:1px solid #F0D5E3;
          border-radius:20px;padding:28px 26px;width:100%;max-width:380px;
          box-shadow:0 30px 70px -24px rgba(20,4,22,.6);animation:lpr-card-in .3s ease both;
        }
        .lpr-modal h3{font-size:17px;font-weight:800;color:#1F1338;margin:0 0 6px;letter-spacing:-.3px}
        .lpr-modal p{font-size:13px;color:#6B5B8C;margin:0 0 20px;line-height:1.6}
        .lpr-modal-ok{
          background:#E6F6F0;border:1.5px solid #6EE7B7;border-radius:12px;padding:14px;
          text-align:center;color:#0B7D59;font-size:12.5px;line-height:1.6
        }
        .lpr-modal-ok i{color:#0B7D59;font-size:18px;display:block;margin-bottom:6px}
        .lpr-modal-row{display:flex;gap:8px;margin-top:16px}
        .lpr-modal-cancel{
          flex:1;padding:12px;border:1.5px solid #9D5B8C;border-radius:11px;
          background:#fff;color:#6B5B8C;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
          transition:background .18s,border-color .18s
        }
        .lpr-modal-cancel:hover{background:#FCE7F3;border-color:#BE185D}
        .lpr-modal-send{
          flex:2;padding:12px;border:none;border-radius:11px;
          background:#BE185D;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
          transition:background .18s
        }
        .lpr-modal-send:hover:not(:disabled){background:#9D174D}
        .lpr-modal-send:disabled{opacity:.55;cursor:not-allowed}

        /* Quien navega con el teclado tiene que ver donde esta parado. */
        .lpr-card a:focus-visible,.lpr-card button:focus-visible,
        .lpr-modal button:focus-visible{outline:2px solid #BE185D;outline-offset:3px;border-radius:10px}
        .lpr-btn:focus-visible{outline-color:#1F1338}

        @media(prefers-reduced-motion:reduce){
          .lpr-card,.lpr-greet,.lpr-sub,.lpr-err{animation:none!important}
        }

        @media(max-width:480px){
          .lpr-wrap{padding:16px}
          .lpr-card{padding:30px 22px 24px;border-radius:20px}
          .lpr-greet{font-size:22px}
          /* iOS no hace zoom si el input mide 16px o mas */
          .lpr-inp{font-size:16px!important;padding:14px 15px!important}
        }
      `}</style>

      <div className="lpr-wrap">
        <form className="lpr-card" onSubmit={e => { e.preventDefault(); handleLogin() }}>
          <div className="lpr-top">
            <div className="lpr-logo" aria-hidden="true">A</div>
            <div className="lpr-brand-txt">
              <span className="lpr-brand-name">ANMA <span>Regalos</span></span>
              <span className="lpr-brand-tag">Tu negocio de regalos, ordenado</span>
            </div>
          </div>

          <div className="lpr-greet">
            {isSignup
              ? <>Creá tu cuenta</>
              : <>{greeting()}{knownName ? <>, <em>{knownName}</em></> : <em></em>}</>}
          </div>
          <div className="lpr-sub">
            {isSignup
              ? <>Registrate en segundos y empezá a gestionar tu negocio.</>
              : lastLoginRel
                ? <>Tu último ingreso fue <b>{lastLoginRel}</b>. Volvemos a lo importante.</>
                : <>Ingresá para retomar pedidos, stock y entregas donde los dejaste.</>}
          </div>

          {signupDone && (
            <div style={{
              background: '#E6F6F0', border: '1.5px solid #6EE7B7',
              borderRadius: 11, color: '#0B7D59', fontSize: 13, fontWeight: 600,
              padding: '14px 16px', marginBottom: 14, lineHeight: 1.6, textAlign: 'center',
            }}>
              <i className="fa fa-circle-check" style={{ color: '#0B7D59', fontSize: 18, display: 'block', marginBottom: 6 }} />
              Revisá tu email <b style={{ color: '#07533B' }}>{email}</b> para confirmar tu cuenta.
              <br />Despues volvé aca e ingresá con tu contraseña.
            </div>
          )}

          {err && (
            <div className="lpr-err">
              <i className="fa fa-circle-exclamation" /><span>{err}</span>
            </div>
          )}

          <div className="lpr-fg">
            <label className="lpr-lbl">Email</label>
            <input type="email" className="lpr-inp" placeholder="tu@email.com"
              name="email" id="email"
              value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKey} autoComplete="email" autoFocus={!email} />
          </div>

          <div className="lpr-fg">
            <label className="lpr-lbl">
              <span>Contraseña</span>
              <button type="button" className="lpr-forgot" onClick={openForgot}>¿La olvidaste?</button>
            </label>
            <div className="lpr-pw">
              <input
                type={showPwd ? 'text' : 'password'}
                className="lpr-inp"
                placeholder="••••••••"
                name="password" id="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={handleKey}
                autoComplete="current-password"
                style={{ paddingRight: 42 }}
                autoFocus={!!email}
              />
              <button className="lpr-eye" type="button" onClick={() => setShowPwd(!showPwd)} title={showPwd ? 'Ocultar' : 'Mostrar'}>
                <i className={`fa ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
            {capsOn && (
              <div className="lpr-caps">
                <i className="fa fa-arrow-up" /><span>Bloq Mayús está activado</span>
              </div>
            )}
          </div>

          <button type="submit" className="lpr-btn" disabled={submitting || signupDone}>
            {submitting
              ? <><i className="fa fa-spinner fa-spin" /> {isSignup ? 'Creando cuenta...' : 'Ingresando...'}</>
              : isSignup
                ? <><i className="fa fa-user-plus" /> Crear mi cuenta</>
                : <><i className="fa fa-arrow-right-to-bracket" /> Entrar a mi negocio</>}
          </button>

          <div style={{
            textAlign: 'center', marginTop: 18, marginBottom: 14,
            fontSize: 13, color: '#6B5B8C',
          }}>
            {isSignup ? '¿Ya tenés cuenta? ' : '¿No tenés cuenta? '}
            <button type="button" onClick={() => { setIsSignup(!isSignup); setErr(''); setSignupDone(false) }} style={{
              background: 'none', border: 'none', color: '#BE185D', fontWeight: 700,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              borderBottom: '1px dashed #E5B9D2', paddingBottom: 1,
            }}>
              {isSignup ? 'Ingresá aca' : 'Registrate gratis'} →
            </button>
          </div>

          <div className="lpr-divider">o</div>

          <a className="lpr-cta" href="/landing.html">
            <span className="lpr-cta-pill">Nuevo</span>
            ¿Recién empezás? Conocé ANMA Regalos
            <i className="fa fa-arrow-right" style={{ fontSize: 11, marginLeft: 2 }} />
          </a>

          <div className="lpr-foot">
            <span><i className="fa fa-lock" /> Cifrado E2E</span>
            <span className="lpr-dot" />
            <span>ANMA Regalos <b>{APP_VERSION}</b></span>
            <span className="lpr-dot" />
            <a href="/landing.html#planes">Planes</a>
          </div>
        </form>
      </div>

      {forgotModal && (
        <div className="lpr-modal-bg" onClick={e => { if (e.target === e.currentTarget) setForgotModal(false) }}>
          <div className="lpr-modal">
            <h3><i className="fa fa-key" style={{ color: '#BE185D', marginRight: 8, fontSize: 15 }} />Recuperar contraseña</h3>
            {resetSent ? (
              <>
                <div className="lpr-modal-ok">
                  <i className="fa fa-circle-check" />
                  Listo. Te enviamos un enlace a <b style={{ color: '#07533B' }}>{resetEmail}</b>.<br />
                  Revisá tu bandeja (incluso spam) para crear una nueva contraseña.
                </div>
                <div className="lpr-modal-row">
                  <button className="lpr-modal-cancel" style={{ flex: 1 }} onClick={() => setForgotModal(false)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <p>Te enviamos un enlace para restablecerla. Llega en menos de un minuto.</p>
                <label className="lpr-lbl">Email</label>
                <input type="email" className="lpr-inp" placeholder="tu@email.com"
                  value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleReset() }} autoFocus />
                {resetErr && (
                  <div className="lpr-err" style={{ marginTop: 10, marginBottom: 0 }}>
                    <i className="fa fa-circle-exclamation" /><span>{resetErr}</span>
                  </div>
                )}
                <div className="lpr-modal-row">
                  <button className="lpr-modal-cancel" onClick={() => setForgotModal(false)}>Cancelar</button>
                  <button className="lpr-modal-send" onClick={handleReset} disabled={resetSending}>
                    {resetSending ? <><i className="fa fa-spinner fa-spin" /> Enviando...</> : <><i className="fa fa-paper-plane" /> Enviar enlace</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
