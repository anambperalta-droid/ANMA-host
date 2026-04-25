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
  const { login, resetPassword } = useAuth()

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
    setSubmitting(true); setErr('')
    const result = await login(email, pass)
    if (result) { setErr(friendlyAuthError(result)); setSubmitting(false); return }
    try { localStorage.setItem(LS_LAST_LOGIN, new Date().toISOString()) } catch { /* ignorar */ }
  }

  const handleKey = (e) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
    if (e.key === 'Enter') handleLogin()
  }

  const openForgot = () => { setResetEmail(email); setResetSent(false); setResetErr(''); setForgotModal(true) }

  const handleReset = async () => {
    if (!resetEmail) { setResetErr('Ingresá tu email.'); return }
    setResetSending(true); setResetErr('')
    try { await resetPassword(resetEmail); setResetSent(true) }
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
        @keyframes lpr-orb-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-32px,24px) scale(1.08)} }
        @keyframes lpr-orb-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(28px,-22px) scale(1.12)} }
        @keyframes lpr-orb-c { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,18px) scale(1.06)} }
        @keyframes lpr-card-in {
          0%   { opacity:0; transform:translateY(18px) scale(.985); filter:blur(6px) }
          100% { opacity:1; transform:none; filter:blur(0) }
        }
        @keyframes lpr-fade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes lpr-ring { 0%{box-shadow:0 0 0 0 rgba(244,114,182,.55)} 70%{box-shadow:0 0 0 16px rgba(244,114,182,0)} 100%{box-shadow:0 0 0 0 rgba(244,114,182,0)} }
        @keyframes lpr-float { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-6px) rotate(5deg)} }

        .lpr-wrap{
          position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
          padding:24px;font-family:'Inter',system-ui,sans-serif;
          background:radial-gradient(1100px 800px at 15% 12%,#831843 0%,transparent 58%),
                     radial-gradient(900px 700px at 85% 88%,#7c3aed 0%,transparent 55%),
                     linear-gradient(135deg,#1a0220 0%,#3d0626 35%,#6b1741 70%,#2d0a3a 100%);
          overflow:hidden;
        }
        .lpr-orb{position:absolute;border-radius:50%;pointer-events:none;filter:blur(40px)}
        .lpr-orb1{width:520px;height:520px;top:-160px;right:-140px;background:radial-gradient(circle,rgba(236,72,153,.45) 0%,transparent 70%);animation:lpr-orb-a 16s ease-in-out infinite}
        .lpr-orb2{width:380px;height:380px;bottom:-120px;left:-90px;background:radial-gradient(circle,rgba(168,85,247,.38) 0%,transparent 70%);animation:lpr-orb-b 20s ease-in-out infinite}
        .lpr-orb3{width:240px;height:240px;top:48%;left:18%;background:radial-gradient(circle,rgba(251,191,36,.18) 0%,transparent 70%);animation:lpr-orb-c 22s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.lpr-orb1,.lpr-orb2,.lpr-orb3{animation:none}}

        .lpr-grain{position:absolute;inset:0;pointer-events:none;opacity:.04;mix-blend-mode:overlay;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")}

        .lpr-confetti{position:absolute;font-size:22px;pointer-events:none;animation:lpr-float 4s ease-in-out infinite;opacity:.45;filter:drop-shadow(0 4px 12px rgba(236,72,153,.4))}

        .lpr-card{
          position:relative;z-index:1;width:100%;max-width:420px;
          background:rgba(255,255,255,.07);
          backdrop-filter:blur(28px) saturate(180%);
          -webkit-backdrop-filter:blur(28px) saturate(180%);
          border:1px solid rgba(255,255,255,.14);
          border-radius:24px;padding:36px 34px 28px;
          box-shadow:0 24px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.10);
          animation:lpr-card-in .6s cubic-bezier(.2,.7,.2,1) both;
        }

        .lpr-top{display:flex;align-items:center;gap:12px;margin-bottom:22px}
        .lpr-logo{
          width:46px;height:46px;border-radius:13px;flex-shrink:0;
          background:linear-gradient(135deg,#ec4899 0%,#f472b6 50%,#a855f7 100%);
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 8px 24px rgba(236,72,153,.45);
          animation:lpr-ring 2.6s ease-out 1.2s 1;
        }
        .lpr-logo i{font-size:20px;color:#fff}
        .lpr-brand-txt{display:flex;flex-direction:column;line-height:1}
        .lpr-brand-name{font-size:20px;font-weight:900;color:#fff;letter-spacing:-.5px}
        .lpr-brand-name span{background:linear-gradient(90deg,#fbcfe8,#fda4af);-webkit-background-clip:text;background-clip:text;color:transparent}
        .lpr-brand-tag{font-size:11px;color:rgba(255,255,255,.55);margin-top:3px;letter-spacing:.3px}

        .lpr-greet{
          font-size:24px;font-weight:800;color:#fff;letter-spacing:-.5px;line-height:1.2;
          margin-bottom:6px;animation:lpr-fade .5s .15s ease both
        }
        .lpr-greet em{font-style:normal;background:linear-gradient(90deg,#f472b6,#fbbf24);-webkit-background-clip:text;background-clip:text;color:transparent}
        .lpr-sub{
          font-size:13px;color:rgba(255,255,255,.65);margin-bottom:22px;line-height:1.55;
          animation:lpr-fade .5s .25s ease both
        }
        .lpr-sub b{color:rgba(255,255,255,.9);font-weight:600}

        .lpr-fg{margin-bottom:14px}
        .lpr-lbl{
          display:flex;justify-content:space-between;align-items:center;
          font-size:10.5px;font-weight:700;color:rgba(255,255,255,.7);
          margin-bottom:7px;letter-spacing:.7px;text-transform:uppercase
        }
        .lpr-inp{
          width:100%;padding:13px 15px;box-sizing:border-box;
          background:rgba(255,255,255,.08);
          border:1.5px solid rgba(255,255,255,.14);
          border-radius:12px;font-size:14px;color:#fff;outline:none;
          transition:border-color .2s,background .2s,box-shadow .2s;
          font-family:'Inter',sans-serif;
        }
        .lpr-inp::placeholder{color:rgba(255,255,255,.32)}
        .lpr-inp:focus{
          border-color:rgba(244,114,182,.65);
          background:rgba(255,255,255,.12);
          box-shadow:0 0 0 4px rgba(244,114,182,.14);
        }
        .lpr-pw{position:relative}
        .lpr-eye{
          position:absolute;right:12px;top:50%;transform:translateY(-50%);
          background:none;border:none;color:rgba(255,255,255,.45);
          font-size:13px;padding:6px;cursor:pointer;transition:color .2s;
        }
        .lpr-eye:hover{color:rgba(255,255,255,.9)}

        .lpr-forgot{
          background:none;border:none;color:#f9a8d4;font-size:11px;font-weight:600;
          cursor:pointer;padding:0;font-family:inherit;letter-spacing:.2px;
          transition:color .15s;text-transform:none
        }
        .lpr-forgot:hover{color:#fbcfe8;text-decoration:underline}

        .lpr-err{
          background:rgba(220,38,38,.12);border:1.5px solid rgba(252,165,165,.4);border-radius:11px;
          color:#fca5a5;font-size:12px;padding:10px 13px;margin-bottom:14px;
          display:flex;align-items:center;gap:8px;animation:lpr-fade .25s ease both;
        }
        .lpr-caps{display:flex;align-items:center;gap:6px;margin-top:7px;font-size:10.5px;color:#fbbf24;font-weight:600}

        .lpr-btn{
          width:100%;padding:14px;margin-top:8px;
          background:linear-gradient(135deg,#ec4899 0%,#db2777 60%,#a855f7 100%);
          color:#fff;border:none;border-radius:12px;
          font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit;
          box-shadow:0 8px 24px rgba(219,39,119,.45),inset 0 1px 0 rgba(255,255,255,.18);
          transition:transform .15s,box-shadow .25s,filter .2s;
          display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:.2px;
        }
        .lpr-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 30px rgba(219,39,119,.6)}
        .lpr-btn:active:not(:disabled){transform:translateY(0)}
        .lpr-btn:disabled{opacity:.65;cursor:not-allowed}

        .lpr-divider{
          display:flex;align-items:center;gap:10px;
          margin:18px 0 12px;font-size:10.5px;color:rgba(255,255,255,.35);
          text-transform:uppercase;letter-spacing:1.2px;font-weight:600
        }
        .lpr-divider::before,.lpr-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.10)}

        .lpr-cta{
          display:flex;align-items:center;justify-content:center;gap:6px;
          width:100%;padding:11px;border:1.5px solid rgba(255,255,255,.15);
          background:rgba(255,255,255,.05);border-radius:11px;
          color:rgba(255,255,255,.88);font-size:12.5px;font-weight:600;
          text-decoration:none;transition:background .2s,border-color .2s,transform .15s;
        }
        .lpr-cta:hover{background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.3);transform:translateY(-1px)}
        .lpr-cta-pill{font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;
          background:linear-gradient(135deg,#ec4899,#a855f7);color:#fff;padding:2px 7px;border-radius:8px;margin-right:4px}

        .lpr-foot{
          margin-top:20px;text-align:center;font-size:10.5px;color:rgba(255,255,255,.32);
          letter-spacing:.4px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap
        }
        .lpr-foot i{color:#f472b6}
        .lpr-foot b{color:rgba(255,255,255,.5);font-weight:600}
        .lpr-foot a{color:rgba(255,255,255,.5);text-decoration:none}
        .lpr-foot a:hover{color:#f9a8d4}
        .lpr-dot{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.2);display:inline-block}

        .lpr-modal-bg{position:fixed;inset:0;z-index:10000;background:rgba(20,5,30,.72);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)}
        .lpr-modal{
          background:rgba(30,15,40,.88);backdrop-filter:blur(28px);
          border:1px solid rgba(255,255,255,.14);
          border-radius:20px;padding:30px 26px;width:100%;max-width:380px;
          box-shadow:0 24px 64px rgba(0,0,0,.55);animation:lpr-card-in .35s ease both;
        }
        .lpr-modal h3{font-size:17px;font-weight:800;color:#fff;margin:0 0 6px;letter-spacing:-.3px}
        .lpr-modal p{font-size:13px;color:rgba(255,255,255,.65);margin:0 0 20px;line-height:1.6}
        .lpr-modal-ok{background:rgba(16,185,129,.12);border:1.5px solid rgba(110,231,183,.4);border-radius:12px;padding:14px;text-align:center;color:#86efac;font-size:13px;font-weight:600;line-height:1.6}
        .lpr-modal-ok i{color:#10b981;font-size:18px;display:block;margin-bottom:6px}
        .lpr-modal-row{display:flex;gap:8px;margin-top:16px}
        .lpr-modal-cancel{flex:1;padding:11px;border:1.5px solid rgba(255,255,255,.14);border-radius:10px;background:transparent;color:rgba(255,255,255,.7);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
        .lpr-modal-cancel:hover{background:rgba(255,255,255,.04)}
        .lpr-modal-send{flex:2;padding:11px;border:none;border-radius:10px;background:linear-gradient(135deg,#ec4899,#a855f7);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px}
        .lpr-modal-send:disabled{opacity:.6;cursor:not-allowed}

        @media(max-width:480px){
          .lpr-card{padding:30px 24px 24px;border-radius:20px}
          .lpr-greet{font-size:21px}
          .lpr-confetti{display:none}
        }
      `}</style>

      <div className="lpr-wrap">
        <div className="lpr-orb lpr-orb1" />
        <div className="lpr-orb lpr-orb2" />
        <div className="lpr-orb lpr-orb3" />
        <div className="lpr-grain" />
        {/* Pequeños detalles temáticos: regalos flotantes */}
        <span className="lpr-confetti" style={{ top: '14%', left: '10%' }}>🎁</span>
        <span className="lpr-confetti" style={{ top: '22%', right: '12%', animationDelay: '.8s' }}>🎀</span>
        <span className="lpr-confetti" style={{ bottom: '18%', left: '14%', animationDelay: '1.4s' }}>✨</span>
        <span className="lpr-confetti" style={{ bottom: '22%', right: '10%', animationDelay: '2s' }}>💝</span>

        <form className="lpr-card" onSubmit={e => { e.preventDefault(); handleLogin() }}>
          <div className="lpr-top">
            <div className="lpr-logo"><i className="fa fa-gift" /></div>
            <div className="lpr-brand-txt">
              <span className="lpr-brand-name">ANMA <span>Regalos</span></span>
              <span className="lpr-brand-tag">Tu negocio de regalos, ordenado</span>
            </div>
          </div>

          <div className="lpr-greet">
            {greeting()}{knownName ? <>, <em>{knownName}</em></> : <em> 🎁</em>}
          </div>
          <div className="lpr-sub">
            {lastLoginRel
              ? <>Tu último ingreso fue <b>{lastLoginRel}</b>. Volvemos a lo importante.</>
              : <>Ingresá para retomar pedidos, stock y entregas donde los dejaste.</>}
          </div>

          {err && (
            <div className="lpr-err">
              <i className="fa fa-circle-exclamation" /><span>{err}</span>
            </div>
          )}

          <div className="lpr-fg">
            <label className="lpr-lbl">Email</label>
            <input type="email" className="lpr-inp" placeholder="tu@email.com"
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

          <button type="submit" className="lpr-btn" disabled={submitting}>
            {submitting
              ? <><i className="fa fa-spinner fa-spin" /> Ingresando...</>
              : <><i className="fa fa-arrow-right-to-bracket" /> Entrar a mi negocio</>}
          </button>

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
            <h3><i className="fa fa-key" style={{ color: '#f472b6', marginRight: 8, fontSize: 15 }} />Recuperar contraseña</h3>
            {resetSent ? (
              <>
                <div className="lpr-modal-ok">
                  <i className="fa fa-circle-check" />
                  Listo. Te enviamos un enlace a <b style={{ color: '#fff' }}>{resetEmail}</b>.<br />
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
