import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { supabase } from '../../lib/supabase'
import {
  getBillingStatus,
  STATUS,
  MONTHLY_AMOUNT,
  fmtMoney,
  fmtShortDate,
} from '../../lib/subscription'

/**
 * MiCuenta — dashboard del cliente con su relación contra ANMA.
 *
 * NO duplica lo que ya está en Configuración:
 *   - Configuración → Identidad / Contacto / Comercial = datos del negocio
 *   - Mi Cuenta = mi suscripción + mis pagos a ANMA + acceso
 *
 * Estructura:
 *   1. Header con avatar + estado de suscripción
 *   2. Card "Estado de suscripción" — próximo vencimiento, días, total pagado
 *   3. Card "Historial de pagos a ANMA" — lectura de workspace_payments
 *   4. Card "Acceso" — cambiar password
 *   5. Card "Mis datos" — descargar backup + cancelar suscripción
 *   6. Link a Configuración para editar datos del negocio
 */

export default function MiCuenta() {
  const { user, role, changePassword, trial } = useAuth()
  const { config, get } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const c = config()

  const [workspace, setWorkspace] = useState(null)
  const [payments, setPayments] = useState([])
  const [loadingWs, setLoadingWs] = useState(true)
  const [loadingPay, setLoadingPay] = useState(true)
  const [paying, setPaying] = useState(false)

  // Password change modal
  const [pwModal, setPwModal] = useState(false)
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Cargar workspace + pagos
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoadingWs(true); setLoadingPay(true)
      try {
        const { data: mb } = await supabase
          .from('memberships')
          .select('workspace_id')
          .eq('user_id', user.id)
          .eq('role', 'owner')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        const wsId = mb?.workspace_id || user.id
        const { data: ws } = await supabase
          .from('workspaces')
          .select('id, name, subscription_status, activated_at, next_payment_due_at, last_payment_at, lifetime_revenue, created_at')
          .eq('id', wsId)
          .maybeSingle()
        if (cancelled) return
        setWorkspace(ws)
        setLoadingWs(false)

        const { data: pays } = await supabase
          .from('workspace_payments')
          .select('id, amount, currency, kind, mp_status, mp_payment_method, paid_at, notes')
          .eq('workspace_id', wsId)
          .order('paid_at', { ascending: false })
        if (cancelled) return
        setPayments(pays || [])
        setLoadingPay(false)
      } catch {
        if (!cancelled) {
          setLoadingWs(false)
          setLoadingPay(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const billing = useMemo(() => getBillingStatus(workspace), [workspace])

  // Si NO es owner, mostrar pantalla informativa
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
          Para gestionar la suscripción y los datos de cuenta, hablá con el owner del workspace.
        </p>
      </div>
    )
  }

  // ── Acciones ──────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!workspace?.id) return
    setPaying(true)
    try {
      const kind = workspace.subscription_status === STATUS.TRIAL ? 'onboarding' : 'monthly'
      const resp = await fetch('/api/mp-create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          kind,
          userEmail: user?.email,
        }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.message || 'Error')
      window.location.href = data.init_point
    } catch (e) {
      toast(`Error al generar pago: ${e?.message || ''}`, 'er')
      setPaying(false)
    }
  }

  const downloadMyData = () => {
    try {
      const dataExport = {
        export_date: new Date().toISOString(),
        export_version: '1.0',
        workspace: {
          id: workspace?.id,
          name: workspace?.name,
          subscription_status: workspace?.subscription_status,
          activated_at: workspace?.activated_at,
          lifetime_revenue: workspace?.lifetime_revenue,
        },
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
        payments,
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

  const requestCancel = () => {
    confirm({
      body: '¿Querés cancelar tu suscripción? Vamos a coordinar por WhatsApp para asegurarnos de que no perdés ningún dato. Tus datos quedan guardados 90 días por si querés volver.',
      confirmLabel: 'Hablar con soporte',
    }, () => {
      const msg = `¡Hola! Quiero cancelar mi suscripción de ANMA Regalos${c.businessName ? ` (${c.businessName})` : ''}. ¿Charlamos?`
      window.open(`https://api.whatsapp.com/send?phone=5491169456863&text=${encodeURIComponent(msg)}`, '_blank')
    })
  }

  // ── UI ─────────────────────────────────────────────────────────────────
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
        .mc-field input:focus{border-color:#7C3AED;background:#fff;box-shadow:0 0 0 3px rgba(124,58,237,.08)}
      `}</style>

      {/* ═══ HEADER con avatar + estado ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px',
        background: 'linear-gradient(135deg, #4C1D95, #7C3AED 50%, #A78BFA)',
        borderRadius: 18, marginBottom: 20,
        boxShadow: '0 10px 30px rgba(124,58,237,.25)',
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: '#fff', color: '#7C3AED',
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
          <i className="fa fa-circle" style={{ fontSize: 8, color: billing.urgency === 'paused' ? '#fca5a5' : billing.urgency === 'overdue' ? '#fbbf24' : '#86efac' }} />
          <span>
            {billing.status === STATUS.TRIAL ? 'Período de prueba' :
             billing.status === STATUS.PENDING_SETUP ? 'Esperando setup' :
             billing.status === STATUS.ACTIVE ? 'Al día' :
             billing.status === STATUS.PENDING_PAYMENT ? 'Cuota pendiente' :
             billing.status === STATUS.PAUSED ? 'Pausado' : billing.status}
          </span>
          {billing.status === STATUS.TRIAL && trial?.daysLeft > 0 && (
            <span style={{
              background: 'rgba(255,255,255,.2)',
              padding: '2px 9px', borderRadius: 99,
              fontSize: 11, fontWeight: 800,
            }}>
              {trial.daysLeft}d
            </span>
          )}
        </div>
      </div>

      {/* ═══ ESTADO DE SUSCRIPCIÓN ═══ */}
      <div className="mc-card">
        <div className="mc-card-h">
          <div className="mc-card-title">
            <i className="fa fa-credit-card" />
            Estado de suscripción
          </div>
          {workspace?.subscription_status === STATUS.ACTIVE && billing.daysUntilDue !== null && billing.daysUntilDue <= 10 && (
            <button onClick={handlePay} disabled={paying} className="mc-card-action" style={{ color: '#059669' }}>
              {paying ? <><i className="fa fa-spinner fa-spin" /> Generando…</> : <><i className="fa fa-bolt" /> Adelantar cuota</>}
            </button>
          )}
        </div>

        {loadingWs ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt3)' }}>
            <i className="fa fa-spinner fa-spin" /> Cargando…
          </div>
        ) : (
          <>
            <div className="mc-row">
              <span className="mc-row-lbl">Plan</span>
              <span className="mc-row-val">ANMA Regalos · Gestión Integral</span>
            </div>
            <div className="mc-row">
              <span className="mc-row-lbl">Activación</span>
              <span className="mc-row-val">{workspace?.activated_at ? fmtShortDate(workspace.activated_at) : '— (en trial)'}</span>
            </div>
            <div className="mc-row">
              <span className="mc-row-lbl">Próximo cobro</span>
              <span className="mc-row-val">
                {workspace?.next_payment_due_at ? (
                  <>
                    {fmtShortDate(workspace.next_payment_due_at)}
                    {billing.daysUntilDue !== null && (
                      <span style={{
                        marginLeft: 8, padding: '2px 8px', borderRadius: 99,
                        fontSize: 10.5, fontWeight: 700,
                        background: billing.tone.bg, color: billing.tone.fg,
                      }}>
                        {billing.label}
                      </span>
                    )}
                  </>
                ) : '—'}
              </span>
            </div>
            <div className="mc-row">
              <span className="mc-row-lbl">Cuota mensual</span>
              <span className="mc-row-val">{fmtMoney(MONTHLY_AMOUNT)}</span>
            </div>
            <div className="mc-row">
              <span className="mc-row-lbl">Total pagado a la fecha</span>
              <span className="mc-row-val" style={{ color: Number(workspace?.lifetime_revenue) > 0 ? '#16A34A' : 'var(--txt3)', fontWeight: 800 }}>
                {Number(workspace?.lifetime_revenue) > 0 ? fmtMoney(Number(workspace.lifetime_revenue)) : 'Sin pagos aún'}
              </span>
            </div>
          </>
        )}

        {workspace?.subscription_status === STATUS.TRIAL && (
          <div style={{
            marginTop: 14, padding: '14px 16px',
            background: 'linear-gradient(135deg, rgba(5,150,105,.10), rgba(16,185,129,.04))',
            border: '1px solid rgba(5,150,105,.22)', borderRadius: 12,
          }}>
            {/* Progress bar visual del trial */}
            {trial?.daysLeft >= 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa fa-rocket" style={{ color: '#059669', fontSize: 13 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Período de prueba
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                    {trial.daysLeft === 1 ? 'Último día' : `${trial.daysLeft} días restantes`}
                  </span>
                </div>
                <div style={{
                  height: 6, background: 'rgba(5,150,105,.15)',
                  borderRadius: 99, overflow: 'hidden', marginBottom: 12,
                }}>
                  <div style={{
                    width: `${Math.max(0, Math.min(100, (trial.daysLeft / 7) * 100))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #059669, #10B981)',
                    transition: 'width .3s',
                  }} />
                </div>
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.55, minWidth: 200 }}>
                Activá tu plan ahora para mantener tus datos seguros después de los 7 días.
              </div>
              <button
                onClick={() => nav('/activar')}
                style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'inherit', flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(5,150,105,.3)',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}
              >
                <i className="fa fa-bolt" /> Activar plan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ DATOS DEL NEGOCIO — LINK A CONFIG (no duplicamos) ═══ */}
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

      {/* ═══ HISTORIAL DE PAGOS ═══ */}
      <div className="mc-card">
        <div className="mc-card-h">
          <div className="mc-card-title">
            <i className="fa fa-clock-rotate-left" />
            Historial de pagos a ANMA
          </div>
          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
            {payments.length} {payments.length === 1 ? 'pago' : 'pagos'} registrado{payments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loadingPay ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt3)' }}>
            <i className="fa fa-spinner fa-spin" /> Cargando…
          </div>
        ) : payments.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(124,58,237,.10), rgba(99,102,241,.06))',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12, color: '#7C3AED', fontSize: 22,
            }}>
              <i className="fa fa-receipt" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>
              Aún no hay pagos registrados
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--txt3)', maxWidth: 340, margin: '0 auto', lineHeight: 1.55 }}>
              Cuando hagas tu primer pago (de ingreso o cuota mensual), aparecerá acá con su comprobante.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Fecha</th>
                  <th style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Concepto</th>
                  <th style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right' }}>Monto</th>
                  <th style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const kindLabel = p.kind === 'onboarding' ? 'Pago de ingreso' : p.kind === 'monthly' ? 'Cuota mensual' : 'Pago manual'
                  const statusOk = p.mp_status === 'approved' || p.mp_status === 'manual_confirmed'
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontSize: 12, color: 'var(--txt2)' }}>{fmtShortDate(p.paid_at)}</td>
                      <td style={{ padding: '10px', fontWeight: 600 }}>{kindLabel}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#059669' }}>{fmtMoney(Number(p.amount) || 0)}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                          background: statusOk ? 'rgba(22,163,74,.12)' : 'rgba(217,119,6,.12)',
                          color: statusOk ? '#16A34A' : '#D97706',
                        }}>
                          {statusOk ? 'Pagado' : (p.mp_status || 'pendiente')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <button onClick={downloadMyData} className="account-action" style={accountActionStyle('#7C3AED')}>
            <i className="fa fa-download" style={{ fontSize: 16 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Descargar todos mis datos</div>
              <div style={{ fontSize: 11, opacity: .75, marginTop: 2 }}>JSON con presupuestos, clientes, productos y pagos.</div>
            </div>
          </button>

          <button onClick={requestCancel} className="account-action" style={accountActionStyle('#DC2626')}>
            <i className="fa fa-circle-xmark" style={{ fontSize: 16 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Cancelar suscripción</div>
              <div style={{ fontSize: 11, opacity: .75, marginTop: 2 }}>Tus datos se guardan 90 días por si volvés.</div>
            </div>
          </button>
        </div>

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
              background: '#fff', borderRadius: 16,
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

function accountActionStyle(color) {
  return {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', borderRadius: 12,
    border: `1.5px solid ${color}30`,
    background: `${color}08`,
    color, textAlign: 'left', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all .15s',
  }
}
