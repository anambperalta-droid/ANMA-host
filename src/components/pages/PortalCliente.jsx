import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { decodeClientePortal } from '../../lib/waMsg'

/**
 * Portal público del cliente (sin auth). Se abre desde el link
 * /portal-cliente?d=BASE64 que el negocio comparte por WhatsApp.
 * Read-only. Mobile-first (95% abren desde celular por WA).
 */

const STATUS_FLOW = ['confirmed', 'production', 'ready', 'delivered']
const STATUS_LABEL = {
  draft: 'Presupuestado',
  sent: 'Presupuestado',
  confirmed: 'Confirmado',
  production: 'En producción',
  inprogress: 'En producción',
  ready: 'Listo',
  delivered: 'Entregado',
  lost: 'Cancelado',
}

const fmt = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtDate = (iso) => {
  if (!iso) return ''
  const p = String(iso).slice(0, 10).split('-')
  if (p.length < 3) return iso
  return `${Number(p[2])}-${Number(p[1])}-${p[0].slice(2)}`
}

export default function PortalCliente() {
  const loc = useLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(loc.search)
    const d = params.get('d')
    if (!d) { setError('Link inválido. Pedí a quien te lo compartió uno nuevo.'); return }
    const raw = decodeClientePortal(d)
    if (!raw) { setError('No se pudo abrir el link. Verificá que esté completo.'); return }
    if (raw.expired) { setError('Este link ya venció. Pedí a quien te lo compartió uno nuevo.'); return }
    setData(raw)
  }, [loc.search])

  useEffect(() => {
    if (data) document.title = `Tu pedido · ${data.neg || 'ANMA'}`
  }, [data])

  const saldo = useMemo(() => {
    if (!data) return 0
    return Math.max(0, (Number(data.t) || 0) - (Number(data.s) || 0))
  }, [data])

  const estado = data?.st || 'draft'
  const payStatus = data?.ps || 'pending'
  const activeIdx = STATUS_FLOW.indexOf(estado)
  // Si no está en el flow (draft/sent/lost), activeIdx = -1 → nada marcado como activo.

  const copyCbu = (val) => {
    if (!val) return
    navigator.clipboard?.writeText(val).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }

  const waLink = (text) => {
    const num = (data?.wa || '').replace(/\D/g, '')
    const encoded = encodeURIComponent(text)
    return num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`
  }

  if (error) return (
    <div style={S.errorWrap}>
      <div style={S.errorCard}>
        <div style={{ fontSize: 40, marginBottom: 12, color: '#DC2626' }}><i className="fa fa-triangle-exclamation" /></div>
        <h2 style={{ fontSize: 18, color: '#111', margin: '0 0 10px', fontWeight: 800 }}>Link no válido</h2>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!data) return (
    <div style={S.loadingWrap}>
      <div style={S.spinner} />
      <span style={{ marginTop: 12, color: '#7C3AED', fontSize: 13 }}>Cargando...</span>
    </div>
  )

  const items = Array.isArray(data.it) ? data.it : []
  const hasPaymentData = saldo > 0 && (data.cbu || data.al || data.mp)

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pcSpin { to { transform: rotate(360deg); } }
        @keyframes pcIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .pc-fade { animation: pcIn .35s ease-out both; }
        .pc-timeline-step { transition: all .2s; }
        .pc-pay-btn:active { transform: scale(.97); }
      `}</style>

      <div style={S.container} className="pc-fade">
        {/* HERO */}
        <div style={S.hero}>
          <div style={S.heroEye}><i className="fa fa-heart" /></div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Tu pedido con {data.neg || 'nosotros'}
          </div>
          <h1 style={S.heroTitle}>Hola {data.n || ''}!</h1>
          <p style={S.heroSub}>
            Te compartimos el estado y los datos de tu pedido. Es un resumen de solo lectura, se actualiza cuando hay novedades.
          </p>
        </div>

        {/* TIMELINE */}
        {activeIdx !== -1 && estado !== 'lost' && (
          <div style={S.section}>
            <div style={S.sectionLabel}>Estado</div>
            <div style={S.timeline}>
              {STATUS_FLOW.map((st, i) => {
                const done = i < activeIdx
                const active = i === activeIdx
                const label = STATUS_LABEL[st]
                return (
                  <div key={st} style={S.timelineItem} className="pc-timeline-step">
                    <div style={{
                      ...S.timelineDot,
                      background: done ? '#15803D' : active ? '#7C3AED' : '#E5E7EB',
                      color: done || active ? '#fff' : '#9CA3AF',
                      boxShadow: active ? '0 0 0 4px rgba(124,58,237,.15)' : 'none',
                    }}>
                      {done ? <i className="fa fa-check" style={{ fontSize: 11 }} /> : <span style={{ fontSize: 11, fontWeight: 800 }}>{i + 1}</span>}
                    </div>
                    <div style={{
                      ...S.timelineLabel,
                      color: active ? '#111' : done ? '#15803D' : '#9CA3AF',
                      fontWeight: active ? 800 : done ? 700 : 500,
                    }}>{label}</div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div style={{ ...S.timelineLine, background: done ? '#15803D' : '#E5E7EB' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {estado === 'lost' && (
          <div style={S.section}>
            <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '12px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-circle-info" />
              Este pedido fue cancelado. Cualquier duda, consultá al negocio.
            </div>
          </div>
        )}

        {/* ITEMS */}
        {items.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionLabel}>Tu pedido</div>
            <div style={S.card}>
              {items.map((it, i) => {
                const sub = (Number(it.q) || 0) * (Number(it.pu) || 0)
                return (
                  <div key={i} style={{
                    ...S.item,
                    borderBottom: i < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.n}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {it.q || 1}u × {fmt(it.pu)}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums' }}>{fmt(sub)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TOTALES */}
        <div style={S.section}>
          <div style={S.card}>
            <div style={S.totalRow}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Total del pedido</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.t)}</span>
            </div>
            {Number(data.s) > 0 && (
              <div style={S.totalRow}>
                <span style={{ fontSize: 13, color: '#15803D' }}>Seña recibida</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>− {fmt(data.s)}</span>
              </div>
            )}
            {saldo > 0 ? (
              <div style={{ ...S.totalRow, borderTop: '1px dashed #E5E7EB', paddingTop: 12, marginTop: 4 }}>
                <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Saldo pendiente</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#DC2626', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{fmt(saldo)}</span>
              </div>
            ) : payStatus === 'paid' ? (
              <div style={{ ...S.totalRow, borderTop: '1px dashed #E5E7EB', paddingTop: 12, marginTop: 4, justifyContent: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#15803D', fontWeight: 800 }}>
                  <i className="fa fa-circle-check" /> Pedido pagado al 100%
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* FECHA */}
        {data.d && (
          <div style={S.section}>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
                <div style={S.icoBox}><i className="fa fa-calendar-check" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Fecha de entrega</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#111', marginTop: 2 }}>{fmtDate(data.d)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DATOS DE PAGO (si hay saldo) */}
        {hasPaymentData && (
          <div style={S.section}>
            <div style={S.sectionLabel}>Para abonar el saldo</div>
            <div style={S.card}>
              {data.cbu && (
                <PayRow label="CBU" value={data.cbu} onCopy={() => copyCbu(data.cbu)} />
              )}
              {data.al && (
                <PayRow label="Alias" value={data.al} onCopy={() => copyCbu(data.al)} />
              )}
              {data.tit && (
                <PayRow label="Titular" value={data.tit} />
              )}
              {data.mp && (
                <a href={data.mp} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #009EE3, #00B4FF)', color: '#fff',
                  padding: '12px 16px', borderRadius: 12, textDecoration: 'none',
                  fontSize: 14, fontWeight: 800, marginTop: 10,
                  boxShadow: '0 4px 12px rgba(0,158,227,.3)',
                }} className="pc-pay-btn">
                  <i className="fa fa-credit-card" /> Pagar con Mercado Pago
                </a>
              )}
              {copied && (
                <div style={{ fontSize: 11, color: '#15803D', textAlign: 'center', marginTop: 8, fontWeight: 700 }}>
                  <i className="fa fa-circle-check" style={{ marginRight: 4 }} />¡Copiado!
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA WHATSAPP */}
        {data.wa && (
          <div style={S.section}>
            <a
              href={waLink(`Hola! Tengo una consulta sobre mi pedido.`)}
              target="_blank"
              rel="noopener noreferrer"
              style={S.ctaWa}
              className="pc-pay-btn"
            >
              <i className="fa-brands fa-whatsapp" style={{ fontSize: 18 }} /> Consultar al negocio
            </a>
          </div>
        )}

        {/* FOOTER */}
        <div style={S.footer}>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>
            Link válido hasta {new Date(data.e).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
            Hecho con <b style={{ color: '#7C3AED' }}>ANMA</b>
          </div>
        </div>
      </div>
    </div>
  )
}

function PayRow({ label, value, onCopy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ minWidth: 60, fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#111', fontFamily: "'SF Mono','Courier New',monospace", overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-all' }}>{value}</div>
      {onCopy && (
        <button onClick={onCopy} style={{
          background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '6px 10px',
          fontSize: 11, fontWeight: 700, color: '#374151', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }} title="Copiar">
          <i className="fa fa-copy" /> Copiar
        </button>
      )}
    </div>
  )
}

const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    color: '#111',
    paddingBottom: 48,
  },
  container: {
    maxWidth: 520,
    margin: '0 auto',
    padding: '0 16px 16px',
  },
  hero: {
    background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
    borderRadius: '0 0 24px 24px',
    padding: '28px 20px 32px',
    color: '#fff',
    marginLeft: -16,
    marginRight: -16,
    marginBottom: 20,
    textAlign: 'left',
    boxShadow: '0 8px 24px rgba(124,58,237,.2)',
  },
  heroEye: {
    width: 44, height: 44, borderRadius: 12,
    background: 'rgba(255,255,255,.18)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, marginBottom: 12, color: '#fff',
  },
  heroTitle: {
    fontSize: 26, fontWeight: 900, margin: '6px 0 10px', letterSpacing: '-.03em',
    lineHeight: 1.15,
  },
  heroSub: {
    fontSize: 13, color: 'rgba(255,255,255,.88)', margin: 0, lineHeight: 1.55,
  },
  section: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 10, color: '#64748b', fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '.08em',
    marginBottom: 8, padding: '0 2px',
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: '14px 16px',
    border: '1px solid #F1F5F9',
    boxShadow: '0 1px 3px rgba(0,0,0,.04)',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 0',
  },
  totalRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 0',
  },
  icoBox: {
    width: 36, height: 36, borderRadius: 10,
    background: 'rgba(124,58,237,.1)', color: '#7C3AED',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, flexShrink: 0,
  },
  timeline: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 4, position: 'relative', padding: '4px 0',
  },
  timelineItem: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', minWidth: 0,
  },
  timelineDot: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, zIndex: 2, flexShrink: 0,
  },
  timelineLabel: {
    fontSize: 10, textAlign: 'center', lineHeight: 1.2,
    maxWidth: '100%', wordBreak: 'break-word',
  },
  timelineLine: {
    position: 'absolute', top: 13, left: '55%', right: '-45%', height: 2, zIndex: 1,
  },
  ctaWa: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    background: 'linear-gradient(135deg, #25D366, #128C7E)',
    color: '#fff', textDecoration: 'none',
    padding: '14px 20px', borderRadius: 14,
    fontSize: 15, fontWeight: 800,
    boxShadow: '0 6px 16px rgba(37,211,102,.3)',
    transition: 'transform .12s',
  },
  footer: {
    textAlign: 'center', paddingTop: 24, borderTop: '1px dashed #E5E7EB', marginTop: 24,
  },
  errorWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F8FAFC', padding: 20, fontFamily: "'Inter', sans-serif",
  },
  errorCard: {
    background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center',
    maxWidth: 360, boxShadow: '0 10px 30px rgba(0,0,0,.08)',
  },
  loadingWrap: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: '#F8FAFC', fontFamily: "'Inter', sans-serif",
  },
  spinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid rgba(124,58,237,.15)', borderTopColor: '#7C3AED',
    animation: 'pcSpin 1s linear infinite',
  },
}
