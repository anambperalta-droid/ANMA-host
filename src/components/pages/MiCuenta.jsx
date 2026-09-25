import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'

export default function MiCuenta() {
  const { user, role, changePassword } = useAuth()
  const { config, get } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const c = config()

  const [pwModal, setPwModal] = useState(false)
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  if (role !== 'owner') {
    return (
      <div style={{ padding: '40px 20px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(124,58,237,.12)', color: '#7C3AED',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 28,
        }}>
          <i className="fa fa-info-circle" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', margin: '0 0 8px' }}>
          Solo el dueño del negocio ve esta sección
        </h2>
        <p style={{ fontSize: 14, color: 'var(--txt3)', lineHeight: 1.6 }}>
          Para gestionar los datos de cuenta, hablá con el owner del workspace.
        </p>
      </div>
    )
  }

  const downloadMyData = () => {
    try {
      const dataExport = {
        export_date: new Date().toISOString(),
        export_version: '1.0',
        business: c,
        data: {
          budgets:    get('budgets')    || [],
          clients:    get('clients')    || [],
          products:   get('products')   || [],
          insumos:    get('insumos')    || [],
          suppliers:  get('suppliers')  || [],
          shipments:  get('shipments')  || [],
          waTemplates: get('waTemplates') || [],
          stockMoves: get('stockMoves') || [],
        },
      }
      const blob = new Blob([JSON.stringify(dataExport, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const safeName = (c.businessName || 'mi-negocio').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
      a.download = `anma_${safeName}_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast('Backup descargado · todos tus datos guardados', 'ok')
    } catch (e) {
      toast(`No pudimos generar el backup: ${e?.message || ''}`, 'er')
    }
  }

  const handleChangePassword = async () => {
    setPwErr('')
    if (!pwNew || !pwConfirm) { setPwErr('Completá ambos campos.'); return }
    const { validatePassword } = await import('../../lib/validate')
    const v = validatePassword(pwNew)
    if (!v.ok) { setPwErr(v.msg); return }
    if (pwNew !== pwConfirm) { setPwErr('Las contraseñas no coinciden.'); return }
    setPwSaving(true)
    try {
      await changePassword(pwNew)
      toast('Contraseña actualizada', 'ok')
      setPwModal(false)
      setPwNew(''); setPwConfirm('')
    } catch (e) {
      setPwErr(e?.message || 'Error al cambiar contraseña')
    } finally {
      setPwSaving(false)
    }
  }

  const initials = (c.businessName || 'AN').slice(0, 2).toUpperCase()

  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: 920, margin: '0 auto' }}>
      <style>{`
        .mc-card{background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:20px 22px;margin-bottom:16px}
        .mc-card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
        .mc-card-title{font-size:14px;font-weight:800;color:var(--txt);letter-spacing:-.2px;display:flex;align-items:center;gap:8px}
        .mc-card-title i{color:#7C3AED;font-size:13px}
        .mc-card-action{font-size:12px;font-weight:600;color:#7C3AED;background:transparent;border:none;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px}
        .mc-card-action:hover{text-decoration:underline}
        .mc-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:10px}
        .mc-row:last-child{border-bottom:none}
        .mc-row-lbl{font-size:12px;color:var(--txt3);font-weight:600}
        .mc-row-val{font-size:13.5px;color:var(--txt);font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
        .mc-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
        .mc-field label{font-size:11px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em}
        .mc-field input{padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface2);font-size:14px;font-family:inherit;color:var(--txt);outline:none;transition:border-color .15s,background .15s}
        .mc-field input:focus{border-color:#7C3AED;background:var(--surface);box-shadow:0 0 0 3px rgba(124,58,237,.08)}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px',
        background: 'linear-gradient(135deg, #4C1D95, #7C3AED 50%, #A78BFA)',
        borderRadius: 18, marginBottom: 20,
        boxShadow: '0 10px 30px rgba(124,58,237,.25)',
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--surface)', color: '#7C3AED',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900, flexShrink: 0,
          boxShadow: '0 6px 16px rgba(0,0,0,.1)',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>
            Mi cuenta · {user?.email}
          </div>
          <h1 style={{ color: '#fff', margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-.4px' }}>
            {c.businessName || 'Mi negocio'}
          </h1>
        </div>
        <div style={{
          background: 'rgba(255,255,255,.18)',
          border: '1px solid rgba(255,255,255,.3)',
          padding: '7px 16px', borderRadius: 99,
          color: '#fff', fontSize: 12.5, fontWeight: 700,
          backdropFilter: 'blur(6px)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <i className="fa fa-circle" style={{ fontSize: 8, color: '#86efac' }} />
          Cuenta de prueba
        </div>
      </div>

      {/* ═══ LINK A CONFIG ═══ */}
      <div
        onClick={() => nav('/config')}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && nav('/config')}
        style={{
          background: 'var(--surface)', border: '1.5px dashed var(--border)',
          borderRadius: 14, padding: '14px 18px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', transition: 'all .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = 'rgba(124,58,237,.04)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'rgba(124,58,237,.12)', color: '#7C3AED',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, flexShrink: 0,
        }}>
          <i className="fa fa-building" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
            ¿Querés editar los datos de tu negocio?
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 2 }}>
            Nombre, logo, colores, datos fiscales, equipo, módulos → <strong>Configuración</strong>
          </div>
        </div>
        <i className="fa fa-arrow-right" style={{ color: '#7C3AED', fontSize: 12, flexShrink: 0 }} />
      </div>

      {/* ═══ ACCESO ═══ */}
      <div className="mc-card">
        <div className="mc-card-h">
          <div className="mc-card-title">
            <i className="fa fa-key" />
            Acceso
          </div>
        </div>
        <div className="mc-row">
          <span className="mc-row-lbl">Email de inicio de sesión</span>
          <span className="mc-row-val">{user?.email}</span>
        </div>
        <div className="mc-row">
          <span className="mc-row-lbl">Contraseña</span>
          <button onClick={() => setPwModal(true)} className="mc-card-action" style={{ color: '#0EA5E9' }}>
            <i className="fa fa-pen" /> Cambiar
          </button>
        </div>
      </div>

      {/* ═══ MIS DATOS ═══ */}
      <div className="mc-card">
        <div className="mc-card-h">
          <div className="mc-card-title">
            <i className="fa fa-shield-halved" />
            Mis datos
          </div>
        </div>

        <button onClick={downloadMyData} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', borderRadius: 12, width: '100%',
          border: '1.5px solid rgba(124,58,237,.19)',
          background: 'rgba(124,58,237,.03)',
          color: '#7C3AED', textAlign: 'left', cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all .15s',
        }}>
          <i className="fa fa-download" style={{ fontSize: 16 }} />
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Descargar todos mis datos</div>
            <div style={{ fontSize: 11, opacity: .75, marginTop: 2 }}>JSON con presupuestos, clientes, productos y pagos.</div>
          </div>
        </button>

        <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--txt3)', textAlign: 'center', lineHeight: 1.5 }}>
          <i className="fa fa-shield-halved" style={{ marginRight: 5, color: '#16A34A' }} />
          Tus datos están protegidos · Backups diarios · Soporte humano por WhatsApp
        </p>
      </div>

      {/* ═══ MODAL: cambiar contraseña ═══ */}
      {pwModal && (
        <div
          onClick={() => setPwModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(15,12,60,.55)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16,
              maxWidth: 420, width: '100%', padding: '24px 26px',
              boxShadow: '0 25px 70px rgba(15,12,60,.3)',
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>
              <i className="fa fa-key" style={{ marginRight: 8, color: '#0EA5E9' }} />
              Cambiar contraseña
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--txt3)' }}>
              Elegí una nueva contraseña segura. Mínimo 8 caracteres + letra + número.
            </p>
            {pwErr && (
              <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', color: '#991B1B', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                <i className="fa fa-circle-exclamation" /> {pwErr}
              </div>
            )}
            <div className="mc-field">
              <label>Nueva contraseña</label>
              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="Mínimo 8 caracteres" autoFocus />
            </div>
            <div className="mc-field">
              <label>Confirmar contraseña</label>
              <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="Repetí la nueva contraseña" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setPwModal(false)} style={{
                flex: 1, padding: '11px 16px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--surface)',
                color: 'var(--txt2)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Cancelar
              </button>
              <button onClick={handleChangePassword} disabled={pwSaving} style={{
                flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: pwSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                opacity: pwSaving ? .7 : 1,
              }}>
                {pwSaving ? <><i className="fa fa-spinner fa-spin" /> Guardando…</> : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
