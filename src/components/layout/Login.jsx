import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const SOLUTIONS = [
  {
    icon: 'fa-receipt',
    title: 'Pedidos ágiles',
    desc: 'Crea presupuestos y cobros en segundos.',
  },
  {
    icon: 'fa-boxes-stacked',
    title: 'Stock inteligente',
    desc: 'Controla cada unidad y variante al instante.',
  },
  {
    icon: 'fa-truck-fast',
    title: 'Seguimiento total',
    desc: 'Supervisa cada entrega y asegura la felicidad del cliente.',
  },
  {
    icon: 'fa-chart-line',
    title: 'Resultados claros',
    desc: 'Visualiza tu rentabilidad y haz crecer tu pasión.',
  },
]

const SparkleIcon = () => (
  <i className="fa fa-gift" style={{ fontSize: 40, color: '#fff' }} />
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, resetPassword } = useAuth()

  // Forgot password state
  const [forgotModal, setForgotModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetErr, setResetErr] = useState('')

  const handleLogin = async () => {
    if (!email || !pass) { setErr('Completá todos los campos.'); return }
    setSubmitting(true); setErr('')
    const result = await login(email, pass)
    if (result) { setErr(result); setSubmitting(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin() }

  const openForgot = () => {
    setResetEmail(email)
    setResetSent(false)
    setResetErr('')
    setForgotModal(true)
  }

  const handleReset = async () => {
    if (!resetEmail) { setResetErr('Ingresá tu email.'); return }
    setResetSending(true); setResetErr('')
    try {
      await resetPassword(resetEmail)
      setResetSent(true)
    } catch (e) {
      setResetErr(e.message || 'Error al enviar. Verificá el email.')
    }
    setResetSending(false)
  }

  return (
    <>
      <style>{`
        @keyframes lp-breathe {
          0%,100% { box-shadow:0 0 0 0 rgba(139,92,246,0),0 8px 32px rgba(0,0,0,.35); }
          50%      { box-shadow:0 0 44px 14px rgba(167,139,250,.38),0 8px 32px rgba(0,0,0,.35); }
        }
        @keyframes lp-logo-in {
          from { opacity:0; transform:scale(.55); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes lp-fade-up {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes lp-slide-in {
          from { opacity:0; transform:translateX(-28px); }
          to   { opacity:1; transform:translateX(0); }
        }

        .lp2-wrap {
          position:fixed;inset:0;z-index:9999;display:flex;min-height:100vh;
          font-family:'Inter',sans-serif;
        }

        /* ── LEFT ── */
        .lp2-left {
          flex:1;min-width:0;
          background:linear-gradient(145deg,#1a0636 0%,#2d0a57 25%,#4c1d95 60%,#6d28d9 85%,#7c3aed 100%);
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:52px 56px;position:relative;overflow:hidden;
        }
        .lp2-orb { position:absolute;border-radius:50%;pointer-events:none; }
        .lp2-orb1 { width:560px;height:560px;top:-200px;right:-200px;
          background:radial-gradient(circle,rgba(124,58,237,.28) 0%,transparent 68%); }
        .lp2-orb2 { width:320px;height:320px;bottom:-100px;left:-80px;
          background:radial-gradient(circle,rgba(5,150,105,.18) 0%,transparent 68%); }
        .lp2-orb3 { width:180px;height:180px;top:42%;left:8%;
          background:radial-gradient(circle,rgba(167,139,250,.14) 0%,transparent 68%); }

        .lp2-hero { position:relative;z-index:1;text-align:center;max-width:560px;width:100%; }

        .lp2-logo-wrap {
          width:96px;height:96px;border-radius:24px;
          background:rgba(255,255,255,.13);
          backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
          border:1.5px solid rgba(255,255,255,.26);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 28px;
          animation:lp-logo-in .65s cubic-bezier(.34,1.56,.64,1) forwards,
                    lp-breathe 3.2s ease-in-out 1.2s infinite;
          opacity:0;
        }

        .lp2-h1 {
          font-size:33px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1.15;
          margin-bottom:14px;
          animation:lp-fade-up .5s ease forwards;animation-delay:.32s;opacity:0;
        }
        .lp2-h1 em { font-style:normal;color:#c4b5fd; }

        .lp2-sub {
          font-size:14.5px;color:rgba(255,255,255,.65);line-height:1.7;
          margin-bottom:34px;font-weight:400;
          animation:lp-fade-up .5s ease forwards;animation-delay:.52s;opacity:0;
        }

        .lp2-cards { display:grid;grid-template-columns:1fr 1fr;gap:12px; }

        .lp2-card {
          display:flex;flex-direction:column;align-items:flex-start;gap:12px;
          background:rgba(255,255,255,.08);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border:1px solid rgba(255,255,255,.13);
          border-radius:16px;padding:18px;text-align:left;
          transition:transform .22s ease,background .22s ease,border-color .22s ease;
          opacity:0;
        }
        .lp2-card:hover {
          transform:translateY(-4px);
          background:rgba(255,255,255,.14);
          border-color:rgba(255,255,255,.24);
        }
        .lp2-card:nth-child(1){animation:lp-slide-in .45s ease forwards;animation-delay:.72s}
        .lp2-card:nth-child(2){animation:lp-slide-in .45s ease forwards;animation-delay:.92s}
        .lp2-card:nth-child(3){animation:lp-slide-in .45s ease forwards;animation-delay:1.12s}
        .lp2-card:nth-child(4){animation:lp-slide-in .45s ease forwards;animation-delay:1.32s}

        .lp2-card-icon {
          width:44px;height:44px;border-radius:12px;flex-shrink:0;
          background:rgba(5,150,105,.22);
          border:1px solid rgba(5,150,105,.3);
          display:flex;align-items:center;justify-content:center;
          font-size:17px;color:#6ee7b7;
          transition:background .22s,box-shadow .22s;
        }
        .lp2-card:hover .lp2-card-icon {
          background:rgba(5,150,105,.34);
          box-shadow:0 0 20px rgba(52,211,153,.34);
        }
        .lp2-card-t { font-size:14.5px;font-weight:700;color:#fff;margin-bottom:4px;letter-spacing:-.2px; }
        .lp2-card-s { font-size:12.5px;color:rgba(255,255,255,.55);line-height:1.6; }

        /* ── RIGHT ── */
        .lp2-right {
          width:460px;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          padding:52px 52px;background:#ffffff;
        }
        .lp2-form-wrap { width:100%;max-width:340px; }

        .lp2-brand { margin-bottom:36px; }
        .lp2-brand h2 { font-size:26px;font-weight:800;color:#111827;letter-spacing:-.6px;margin-bottom:6px; }
        .lp2-brand p  { font-size:14px;color:#6b7280; }

        .lp2-lbl {
          display:block;font-size:10.5px;font-weight:700;color:#374151;
          margin-bottom:6px;letter-spacing:.7px;text-transform:uppercase;
        }
        .lp2-inp {
          width:100%;padding:12px 14px;box-sizing:border-box;
          background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:11px;
          font-size:14px;color:#111827;outline:none;
          transition:border-color .2s,box-shadow .2s;font-family:'Inter',sans-serif;
        }
        .lp2-inp:focus { border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.1); }
        .lp2-inp::placeholder { color:#9ca3af; }
        .lp2-fg  { margin-bottom:16px; }
        .lp2-pw  { position:relative; }
        .lp2-eye {
          position:absolute;right:11px;top:50%;transform:translateY(-50%);
          background:none;border:none;color:#9ca3af;font-size:13px;padding:4px;cursor:pointer;
          transition:color .2s;
        }
        .lp2-eye:hover { color:#374151; }

        .lp2-forgot {
          display:block;text-align:right;font-size:11px;color:#7c3aed;
          margin-top:5px;background:none;border:none;cursor:pointer;
          padding:0;font-family:'Inter',sans-serif;text-decoration:none;
          transition:color .15s;
        }
        .lp2-forgot:hover { color:#5b21b6;text-decoration:underline; }

        .lp2-err {
          background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;
          color:#dc2626;font-size:12px;padding:9px 12px;margin-bottom:16px;
          display:flex;align-items:center;gap:7px;
        }

        .lp2-btn {
          width:100%;padding:13px;margin-top:6px;
          background:#059669;color:#fff;border:none;border-radius:11px;
          font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;
          box-shadow:0 4px 14px rgba(5,150,105,.28);
          transition:box-shadow .25s,transform .2s,background .2s;
          display:flex;align-items:center;justify-content:center;gap:8px;
        }
        .lp2-btn:hover:not(:disabled) {
          background:#047857;
          box-shadow:0 8px 26px rgba(5,150,105,.42);
          transform:translateY(-1px);
        }
        .lp2-btn:disabled { opacity:.6;cursor:not-allowed; }

        .lp2-sec {
          display:flex;align-items:center;justify-content:center;gap:6px;
          margin-top:22px;font-size:11px;color:#9ca3af;
        }
        .lp2-sec i { color:#059669;font-size:11px; }

        /* ── FORGOT MODAL ── */
        .lp2-modal-bg {
          position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;padding:20px;
          backdrop-filter:blur(4px);
        }
        .lp2-modal {
          background:#fff;border-radius:18px;padding:32px 28px;
          width:100%;max-width:380px;
          box-shadow:0 24px 64px rgba(0,0,0,.18);
          animation:lp-fade-up .25s ease both;
        }
        .lp2-modal h3 { font-size:18px;font-weight:800;color:#111827;margin:0 0 6px;letter-spacing:-.4px; }
        .lp2-modal p  { font-size:13px;color:#6b7280;margin:0 0 22px;line-height:1.6; }
        .lp2-modal-ok {
          background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;
          padding:14px;text-align:center;color:#166534;font-size:13px;font-weight:600;line-height:1.6;
        }
        .lp2-modal-ok i { color:#16a34a;font-size:18px;display:block;margin-bottom:6px; }
        .lp2-modal-row { display:flex;gap:8px;margin-top:18px; }
        .lp2-modal-cancel {
          flex:1;padding:11px;border:1.5px solid #e5e7eb;border-radius:10px;
          background:#fff;color:#374151;font-size:14px;font-weight:600;
          cursor:pointer;font-family:'Inter',sans-serif;transition:background .15s;
        }
        .lp2-modal-cancel:hover { background:#f9fafb; }
        .lp2-modal-send {
          flex:2;padding:11px;border:none;border-radius:10px;
          background:#7c3aed;color:#fff;font-size:14px;font-weight:700;
          cursor:pointer;font-family:'Inter',sans-serif;
          transition:background .2s,box-shadow .2s;
          display:flex;align-items:center;justify-content:center;gap:7px;
        }
        .lp2-modal-send:hover:not(:disabled) { background:#5b21b6;box-shadow:0 4px 14px rgba(124,58,237,.35); }
        .lp2-modal-send:disabled { opacity:.6;cursor:not-allowed; }

        /* ── RESPONSIVE ── */
        @media(max-width:920px){
          .lp2-left { display:none; }
          .lp2-right { width:100%;padding:36px 28px; }
        }
        @media(max-width:480px){
          .lp2-right { padding:28px 20px; }
        }
      `}</style>

      <div className="lp2-wrap">

        {/* ── LADO IZQUIERDO ── */}
        <div className="lp2-left">
          <div className="lp2-orb lp2-orb1" />
          <div className="lp2-orb lp2-orb2" />
          <div className="lp2-orb lp2-orb3" />

          <div className="lp2-hero">
            <div className="lp2-logo-wrap"><SparkleIcon /></div>
            <h1 className="lp2-h1">ANMA <em>El motor detrás</em><br />de cada regalo</h1>
            <p className="lp2-sub">
              Toda tu operativa bajo control<br />en una sola plataforma.
            </p>
            <div className="lp2-cards">
              {SOLUTIONS.map((s) => (
                <div className="lp2-card" key={s.title}>
                  <div className="lp2-card-icon"><i className={`fa ${s.icon}`} /></div>
                  <div>
                    <div className="lp2-card-t">{s.title}</div>
                    <div className="lp2-card-s">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LADO DERECHO ── */}
        <div className="lp2-right">
          <div className="lp2-form-wrap">
            <div className="lp2-brand">
              <h2>Bienvenido de vuelta</h2>
              <p>Ingresá a tu cuenta ANMA Regalos</p>
            </div>

            {err && (
              <div className="lp2-err">
                <i className="fa fa-circle-exclamation" /><span>{err}</span>
              </div>
            )}

            <div className="lp2-fg">
              <label className="lp2-lbl">Email</label>
              <input type="email" className="lp2-inp" placeholder="tu@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey} autoComplete="email" />
            </div>

            <div className="lp2-fg">
              <label className="lp2-lbl">Contraseña</label>
              <div className="lp2-pw">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="lp2-inp"
                  placeholder="••••••••"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  onKeyDown={handleKey}
                  autoComplete="current-password"
                  style={{ paddingRight: 42 }}
                />
                <button className="lp2-eye" type="button" onClick={() => setShowPwd(!showPwd)}>
                  <i className={`fa ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
              <button className="lp2-forgot" type="button" onClick={openForgot}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button className="lp2-btn" onClick={handleLogin} disabled={submitting}>
              {submitting
                ? <><i className="fa fa-spinner fa-spin" /> Ingresando...</>
                : <><i className="fa fa-arrow-right-to-bracket" /> Ingresar</>
              }
            </button>

            <div className="lp2-sec">
              <i className="fa fa-lock" />
              <span>Conexión segura cifrada de punto a punto</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL RECUPERAR CONTRASEÑA ── */}
      {forgotModal && (
        <div className="lp2-modal-bg" onClick={e => { if (e.target === e.currentTarget) setForgotModal(false) }}>
          <div className="lp2-modal">
            <h3><i className="fa fa-key" style={{ color: '#7c3aed', marginRight: 8, fontSize: 16 }} />Recuperar contraseña</h3>
            {resetSent ? (
              <>
                <div className="lp2-modal-ok">
                  <i className="fa fa-circle-check" />
                  Email enviado a <b>{resetEmail}</b>.<br />
                  Revisá tu bandeja y seguí el enlace para crear una nueva contraseña.
                </div>
                <div className="lp2-modal-row">
                  <button className="lp2-modal-cancel" style={{ flex: 1 }} onClick={() => setForgotModal(false)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <p>Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.</p>
                <label className="lp2-lbl">Email</label>
                <input
                  type="email" className="lp2-inp" placeholder="tu@email.com"
                  value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleReset() }}
                  autoFocus
                />
                {resetErr && (
                  <div className="lp2-err" style={{ marginTop: 10, marginBottom: 0 }}>
                    <i className="fa fa-circle-exclamation" /><span>{resetErr}</span>
                  </div>
                )}
                <div className="lp2-modal-row">
                  <button className="lp2-modal-cancel" onClick={() => setForgotModal(false)}>Cancelar</button>
                  <button className="lp2-modal-send" onClick={handleReset} disabled={resetSending}>
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
