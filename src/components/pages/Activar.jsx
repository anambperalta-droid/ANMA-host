import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { supabase } from '../../lib/supabase'

/**
 * /activar — Página de activación de plan ANMA Regalos.
 *
 * Modelo de pricing único:
 *   - Pago de ingreso: $120.000 ARS (única vez, incluye setup + 1er mes)
 *   - Cuota mensual: $30.000 ARS desde el mes 2
 *
 * Filosofía: claridad total. Cero letra chica.
 *
 * Flow:
 *   1. User en trial click "Activar plan" → /activar
 *   2. Ve la propuesta de valor + precio claro
 *   3. Click "Pagar con Mercado Pago"
 *   4. POST /api/mp-create-preference → redirect a checkout MP
 *   5. Post-pago vuelve a /pago-exitoso (success) o /pago-pendiente
 *   6. Webhook MP confirma el pago server-side y actualiza workspace
 */

export default function Activar() {
  const { user, trial, authed, loading } = useAuth()
  const { config } = useData()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [workspaceId, setWorkspaceId] = useState(null)

  // Si no está logueado, redirigir a registro
  useEffect(() => {
    if (!loading && !authed) {
      nav('/registro?next=/activar', { replace: true })
    }
  }, [loading, authed, nav])

  // Resolver workspace_id del user (necesario para crear preference)
  useEffect(() => {
    if (!user?.id) return
    (async () => {
      const { data } = await supabase
        .from('memberships')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle()
      setWorkspaceId(data?.workspace_id || user.id)  // fallback al user.id (self-workspace legacy)
    })()
  }, [user?.id])

  const handlePay = async () => {
    if (!workspaceId) return
    setCreating(true); setError('')
    try {
      const resp = await fetch('/api/mp-create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          kind: 'onboarding',
          userEmail: user?.email,
        }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.message || 'Error creando link de pago')
      // Redirect a Mercado Pago
      window.location.href = data.init_point
    } catch (e) {
      setError(e?.message || 'No pudimos generar el link de pago. Probá de nuevo.')
      setCreating(false)
    }
  }

  if (loading || !authed) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="fa fa-spinner fa-spin" style={{ fontSize: 24, color: '#7C3AED' }} />
      </div>
    )
  }

  const trialDaysLeft = trial?.daysLeft

  return (
    <div style={{
      minHeight: 'calc(100vh - 100px)',
      background: 'linear-gradient(160deg, #faf8ff 0%, #f0fdf4 100%)',
      padding: '32px 20px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Back link */}
        <Link to="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: 'var(--txt3)', fontSize: 13, fontWeight: 600,
          textDecoration: 'none', marginBottom: 18,
        }}>
          <i className="fa fa-arrow-left" /> Volver al panel
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {trial?.isTrial && trialDaysLeft !== null && trialDaysLeft >= 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 99,
              background: trialDaysLeft <= 1 ? '#FEE2E2' : trialDaysLeft <= 3 ? '#FEF3C7' : '#EDE9FE',
              color: trialDaysLeft <= 1 ? '#DC2626' : trialDaysLeft <= 3 ? '#D97706' : '#7C3AED',
              fontSize: 12, fontWeight: 700, marginBottom: 14,
            }}>
              <i className="fa fa-hourglass-half" />
              {trialDaysLeft === 0 ? 'Hoy se vence tu prueba' :
               trialDaysLeft === 1 ? 'Te queda 1 día de prueba' :
               `Te quedan ${trialDaysLeft} días de prueba`}
            </div>
          )}
          <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--txt)', margin: '0 0 8px', letterSpacing: '-.5px' }}>
            Activá tu plan
          </h1>
          <p style={{ fontSize: 15, color: 'var(--txt3)', margin: 0, lineHeight: 1.6, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto' }}>
            Una sola inversión inicial + cuota mensual baja.
            Sin contratos ni sorpresas.
          </p>
        </div>

        {/* Card principal */}
        <div style={{
          background: 'linear-gradient(135deg, #1a0b2e 0%, #2d0a57 100%)',
          color: '#fff', borderRadius: 24, padding: '36px 32px',
          boxShadow: '0 20px 60px rgba(124,58,237,.3)',
          marginBottom: 24,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28, alignItems: 'center' }}>
            {/* Columna izquierda: pricing */}
            <div>
              <span style={{
                display: 'inline-block', padding: '5px 12px', borderRadius: 99,
                background: 'rgba(124,58,237,.25)', color: '#c4b5fd',
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em',
                marginBottom: 14,
              }}>
                Plan Gestión Integral
              </span>

              {/* Pago de ingreso */}
              <div style={{
                background: 'rgba(99,102,241,.12)', border: '1.5px solid rgba(124,58,237,.4)',
                borderRadius: 14, padding: '14px 18px', marginBottom: 14,
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa fa-bolt" />
                  Pago de ingreso
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1 }}>$120.000</span>
                  <span style={{ fontSize: 13, color: '#c4b5fd', fontWeight: 600 }}>por única vez</span>
                </div>
                <p style={{ fontSize: 12, color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                  Incluye <strong style={{ color: '#fff' }}>Setup llave en mano</strong> (configuración y carga de tus datos) + <strong style={{ color: '#c4b5fd' }}>tu primer mes totalmente cubierto</strong>.
                </p>
              </div>

              {/* Cuota mensual */}
              <div style={{ paddingLeft: 4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
                  Desde el mes 2
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-.5px' }}>$30.000</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>/ mes</span>
                </div>
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 0' }}>
                  Costo fijo por infraestructura segura y soporte continuo.
                </p>
              </div>
            </div>

            {/* Columna derecha: beneficios */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>
                Lo que incluye
              </div>
              {[
                { icon: 'fa-layer-group', text: 'Ecosistema ANMA Hub completo (pedidos, clientes, productos, logística)' },
                { icon: 'fa-user-tie', text: 'Setup llave en mano: configuramos y cargamos tus datos por vos' },
                { icon: 'fa-whatsapp', text: 'Soporte humano por WhatsApp en español, asistencia prioritaria', brand: true },
                { icon: 'fa-shield-halved', text: 'Infraestructura segura, encriptación E2E y backups diarios' },
                { icon: 'fa-circle-check', text: 'Sin contratos de permanencia. Cancelás cuando quieras.', accent: true },
              ].map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '8px 0',
                  borderBottom: i < 4 ? '1px solid rgba(255,255,255,.06)' : 'none',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: b.accent ? 'rgba(110,231,183,.18)' : b.brand ? 'rgba(37,211,102,.15)' : 'rgba(124,58,237,.2)',
                    color: b.accent ? '#6ee7b7' : b.brand ? '#25D366' : '#c4b5fd',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, flexShrink: 0, marginTop: 1,
                  }}>
                    <i className={`fa ${b.brand ? 'fa-brands fa-whatsapp' : b.icon}`} />
                  </div>
                  <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.85)', lineHeight: 1.55 }}>
                    {b.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1.5px solid #FECACA',
            color: '#991B1B', padding: '12px 16px', borderRadius: 10,
            marginBottom: 16, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <i className="fa fa-triangle-exclamation" style={{ marginTop: 2 }} />
            <div>{error}</div>
          </div>
        )}

        {/* CTA principal */}
        <button
          onClick={handlePay}
          disabled={creating || !workspaceId}
          style={{
            width: '100%', padding: '17px 28px',
            background: 'linear-gradient(135deg, #059669, #047857)',
            color: '#fff', border: 'none', borderRadius: 14,
            fontSize: 16, fontWeight: 800, cursor: creating ? 'wait' : 'pointer',
            fontFamily: 'inherit', letterSpacing: '-.2px',
            boxShadow: '0 10px 32px rgba(5,150,105,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'transform .15s, box-shadow .2s',
            opacity: creating ? .7 : 1,
          }}
          onMouseEnter={e => !creating && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => (e.currentTarget.style.transform = '')}
        >
          {creating ? (
            <><i className="fa fa-spinner fa-spin" /> Generando link de pago…</>
          ) : (
            <>
              <i className="fa fa-lock" style={{ fontSize: 14 }} />
              Pagar $120.000 con Mercado Pago
            </>
          )}
        </button>

        {/* Trust line */}
        <div style={{ textAlign: 'center', marginTop: 18, display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--txt3)' }}>
          <span><i className="fa fa-lock" style={{ marginRight: 5, color: '#10B981' }} /> Pago seguro con Mercado Pago</span>
          <span><i className="fa fa-credit-card" style={{ marginRight: 5, color: '#7C3AED' }} /> Aceptamos todas las tarjetas</span>
          <span><i className="fa fa-shield-halved" style={{ marginRight: 5, color: '#7C3AED' }} /> SSL · Encriptación E2E</span>
        </div>

        {/* FAQ resumido */}
        <div style={{ marginTop: 36, padding: '24px 28px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa fa-circle-question" style={{ color: '#7C3AED' }} />
            Preguntas frecuentes
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { q: '¿El pago de $120.000 es por única vez?', a: 'Sí. Cubre el setup llave en mano + tu primer mes. Desde el mes 2 pagás solo $30.000.' },
              { q: '¿Cómo se cobra el mes 2 en adelante?', a: 'Te avisaremos por WhatsApp con un link de pago. Mientras crecemos, gestionamos cada cobro de forma personalizada.' },
              { q: '¿Qué pasa si quiero cancelar?', a: 'Cancelás cuando quieras, sin penalidades. Tus datos siguen guardados 90 días por si querés volver.' },
              { q: '¿Y si no estoy conforme?', a: 'Tenés 7 días desde el pago para pedir devolución completa, sin preguntas.' },
            ].map((item, i) => (
              <details key={i} style={{ borderBottom: i < 3 ? '1px solid var(--border)' : 'none', paddingBottom: i < 3 ? 12 : 0 }}>
                <summary style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{item.q}</span>
                  <i className="fa fa-plus" style={{ fontSize: 11, color: 'var(--txt3)' }} />
                </summary>
                <p style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '8px 0 0', lineHeight: 1.6 }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--txt3)' }}>
          ¿Dudas? Escribinos a{' '}
          <a href="https://api.whatsapp.com/send?phone=5491169456863&text=¡Hola! Tengo una consulta sobre la activación de ANMA Regalos" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', fontWeight: 700, textDecoration: 'none' }}>
            <i className="fa-brands fa-whatsapp" /> WhatsApp
          </a>
        </p>
      </div>
    </div>
  )
}
