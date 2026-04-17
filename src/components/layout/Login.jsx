import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const SOLUTIONS = [
  {
    icon: 'fa-gift',
    title: 'Presupuestos que convierten',
    desc: 'Diseñá y enviá propuestas profesionales en segundos, desde cualquier dispositivo.',
  },
  {
    icon: 'fa-users',
    title: 'Relaciones impecables',
    desc: 'Centralizá el historial de tus clientes y proveedores para una gestión sin errores.',
  },
  {
    icon: 'fa-layer-group',
    title: 'Control total de procesos',
    desc: 'Supervisá cada etapa de tu operativa y asegurate de que nada se quede en el camino.',
  },
  {
    icon: 'fa-chart-line',
    title: 'Métricas para crecer',
    desc: 'Visualizá la salud de tu negocio con reportes de rentabilidad e ingresos en tiempo real.',
  },
]

const AnmaLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="46" fill="none" viewBox="0 0 48 46">
    <path fill="white" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
  </svg>
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()

  const handleLogin = async () => {
    if (!email || !pass) { setErr('Completá todos los campos.'); return }
    setSubmitting(true); setErr('')
    const result = await login(email, pass)
    if (result) { setErr(result); setSubmitting(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin() }

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

        .lp2-hero { position:relative;z-index:1;text-align:center;max-width:430px;width:100%; }

        .lp2-logo-wrap {
          width:86px;height:86px;border-radius:22px;
          background:rgba(255,255,255,.13);
          backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
          border:1.5px solid rgba(255,255,255,.26);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 24px;
          animation:lp-logo-in .65s cubic-bezier(.34,1.56,.64,1) forwards,
                    lp-breathe 3.2s ease-in-out 1.2s infinite;
          opacity:0;
        }

        .lp2-h1 {
          font-size:27px;font-weight:800;color:#fff;letter-spacing:-.7px;line-height:1.2;
          margin-bottom:11px;
          animation:lp-fade-up .5s ease forwards;animation-delay:.32s;opacity:0;
        }
        .lp2-h1 em { font-style:normal;color:#c4b5fd; }

        .lp2-sub {
          font-size:13px;color:rgba(255,255,255,.62);line-height:1.65;
          margin-bottom:30px;font-weight:400;
          animation:lp-fade-up .5s ease forwards;animation-delay:.52s;opacity:0;
        }

        .lp2-cards { display:flex;flex-direction:column;gap:0; }

        .lp2-card {
          display:flex;align-items:flex-start;gap:13px;
          background:rgba(255,255,255,.07);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border:1px solid rgba(255,255,255,.11);
          border-radius:14px;padding:13px 15px;margin-bottom:9px;text-align:left;
          transition:transform .22s ease,background .22s ease,border-color .22s ease;
          opacity:0;
        }
        .lp2-card:hover {
          transform:translateY(-3px);
          background:rgba(255,255,255,.12);
          border-color:rgba(255,255,255,.22);
        }
        .lp2-card:nth-child(1){animation:lp-slide-in .45s ease forwards;animation-delay:.72s}
        .lp2-card:nth-child(2){animation:lp-slide-in .45s ease forwards;animation-delay:.92s}
        .lp2-card:nth-child(3){animation:lp-slide-in .45s ease forwards;animation-delay:1.12s}
        .lp2-card:nth-child(4){animation:lp-slide-in .45s ease forwards;animation-delay:1.32s}

        .lp2-card-icon {
          width:38px;height:38px;border-radius:10px;flex-shrink:0;
          background:rgba(5,150,105,.22);
          border:1px solid rgba(5,150,105,.3);
          display:flex;align-items:center;justify-content:center;
          font-size:14px;color:#6ee7b7;
          transition:background .22s,box-shadow .22s;
        }
        .lp2-card:hover .lp2-card-icon {
          background:rgba(5,150,105,.32);
          box-shadow:0 0 18px rgba(52,211,153,.32);
        }
        .lp2-card-t { font-size:12.5px;font-weight:700;color:#fff;margin-bottom:3px;letter-spacing:-.15px; }
        .lp2-card-s { font-size:11px;color:rgba(255,255,255,.48);line-height:1.55; }

        /* ── RIGHT ── */
        .lp2-right {
          width:440px;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          padding:52px 48px;background:#ffffff;
        }
        .lp2-form-wrap { width:100%;max-width:320px; }

        .lp2-brand { margin-bottom:34px; }
        .lp2-brand h2 { font-size:22px;font-weight:800;color:#111827;letter-spacing:-.5px;margin-bottom:5px; }
        .lp2-brand p  { font-size:13px;color:#6b7280; }

        .lp2-lbl {
          display:block;font-size:10px;font-weight:700;color:#374151;
          margin-bottom:5px;letter-spacing:.7px;text-transform:uppercase;
        }
        .lp2-inp {
          width:100%;padding:10px 13px;box-sizing:border-box;
          background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:10px;
          font-size:13px;color:#111827;outline:none;
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

        .lp2-err {
          background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;
          color:#dc2626;font-size:12px;padding:9px 12px;margin-bottom:16px;
          display:flex;align-items:center;gap:7px;
        }

        .lp2-btn {
          width:100%;padding:12px;margin-top:4px;
          background:#059669;color:#fff;border:none;border-radius:10px;
          font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;
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
            <div className="lp2-logo-wrap"><AnmaLogo /></div>
            <h1 className="lp2-h1">ANMA: <em>El centro de mando</em><br />de tu negocio.</h1>
            <p className="lp2-sub">
              Presupuestos, seguimiento y resultados.<br />
              Toda tu operativa bajo control, en un solo lugar.
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
    </>
  )
}
