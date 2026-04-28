import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Portal público de proveedor — v2
 * Diseño sobrio-profesional con acento de color.
 * Sin auth. Datos via ?d=BASE64
 */
export default function PortalProveedor() {
  const loc = useLocation()
  const [data, setData]       = useState(null)
  const [error, setError]     = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    try {
      const p = new URLSearchParams(loc.search)
      const d = p.get('d')
      if (!d) { setError('Link inválido o vencido.'); return }
      const json = decodeURIComponent(escape(atob(d.replace(/-/g, '+').replace(/_/g, '/'))))
      const parsed = JSON.parse(json)
      if (parsed.exp && Date.now() > parsed.exp) {
        setError('Este enlace venció. Pedile a tu cliente que genere uno nuevo.')
        return
      }
      setData(parsed)
    } catch {
      setError('No se pudo abrir el enlace. Verificá que esté completo.')
    }
  }, [loc.search])

  const fmt = n => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const products     = data?.products || []
  const reorder      = useMemo(() => products.filter(p => p.reorder), [products])
  const totalValue   = useMemo(() => products.reduce((s, p) => s + (Number(p.cost) || 0), 0), [products])
  const reorderTotal = useMemo(() =>
    reorder.reduce((s, p) => s + (Number(p.cost) || 0) * Math.max(1, (p.minStock || 0) - (p.stock || 0)), 0),
    [reorder])

  const expDate  = data?.exp ? new Date(data.exp).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : null
  const daysLeft = data?.exp ? Math.max(0, Math.ceil((data.exp - Date.now()) / 86400000)) : null

  const buildMsg = type => {
    const owner = data?.ownerName || 'tu cliente'
    const biz   = data?.ownerBusiness ? ` (${data.ownerBusiness})` : ''
    const lista  = products.slice(0, 4).map(p => p.name).join(', ') + (products.length > 4 ? ` y ${products.length - 4} más` : '')
    if (type === 'confirm') return encodeURIComponent(`Hola ${owner}${biz}! Revisé el portal y confirmo disponibilidad para: ${lista}. Podemos avanzar.`)
    if (type === 'ask')     return encodeURIComponent(`Hola ${owner}${biz}! Revisé el portal del pedido y tengo una consulta antes de confirmar.`)
    if (type === 'urgent')  return encodeURIComponent(`Hola ${owner}${biz}! Vi el aviso de re-orden para: ${reorder.map(p => p.name).join(', ')}. Confirmo disponibilidad.`)
    return ''
  }
  const wa = type => data?.ownerWa
    ? `https://wa.me/${data.ownerWa.replace(/\D/g, '')}?text=${buildMsg(type)}`
    : null

  const copyAllProducts = () => {
    const lines = products.map(p => `• ${p.name} — ${fmt(p.cost)}${p.reorder ? ' (RE-ORDEN)' : ''}`).join('\n')
    const txt = `Pedido · ${data?.ownerName || 'cliente'}:\n\n${lines}\n\nTotal: ${fmt(totalValue)}`
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200) })
  }

  /* ── Error ── */
  if (error) return (
    <div style={S.fullCenter}>
      <div style={S.msgCard}>
        <div style={{ fontSize: 38, marginBottom: 14 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', color: '#111827', fontSize: 18, fontWeight: 800 }}>Link no disponible</h2>
        <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 8px', lineHeight: 1.6 }}>{error}</p>
        <p style={{ color: '#9CA3AF', fontSize: 12, margin: 0 }}>Si el problema persiste, contactá a quien te compartió el enlace.</p>
      </div>
    </div>
  )

  /* ── Loading ── */
  if (!data) return (
    <div style={{ ...S.fullCenter, flexDirection: 'column', gap: 14 }}>
      <div style={S.spinner} />
      <span style={{ color: '#9CA3AF', fontSize: 13 }}>Cargando portal...</span>
    </div>
  )

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes pp-in  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes pp-spin{ to{transform:rotate(360deg)} }
        .pc{ animation:pp-in .32s ease both }
        .pc:nth-child(2){animation-delay:.06s}.pc:nth-child(3){animation-delay:.12s}
        .pc:nth-child(4){animation-delay:.18s}.pc:nth-child(5){animation-delay:.22s}
        .pc:nth-child(6){animation-delay:.26s}
        .pp-row:hover{ background:#F5F3FF !important }
        .wa-confirm{ transition:transform .15s,box-shadow .2s }
        .wa-confirm:hover{ transform:translateY(-2px);box-shadow:0 12px 28px rgba(22,163,74,.38) }
        .wa-ask{ transition:background .15s,border-color .15s }
        .wa-ask:hover{ background:#F5F3FF !important;border-color:#C4B5FD !important }
        .pp-copy:hover{ background:#EDE9FE !important;color:#7C3AED !important }
      `}</style>

      <div style={S.container}>

        {/* ── HERO ── */}
        <div className="pc" style={S.hero}>
          {/* decorative circle */}
          <div style={S.heroCircle} />
          <div style={{ position: 'relative' }}>
            <div style={S.heroBadge}>
              {data.ownerBusiness || 'Portal de pedido'}
            </div>
            <h1 style={S.heroTitle}>
              Hola, {data.contact || data.supplierName}
            </h1>
            <p style={S.heroSub}>
              <b style={{ color: '#E9D5FF' }}>{data.ownerName}</b> te compartió el detalle de los
              productos que necesita. Revisá precios, condiciones y confirmá tu disponibilidad.
            </p>
            <div style={S.heroChips}>
              {expDate && (
                <div style={{
                  ...S.chip,
                  ...(daysLeft !== null && daysLeft <= 5 ? { borderColor: '#FCD34D', color: '#FCD34D' } : {})
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Válido hasta {expDate}
                  {daysLeft !== null && daysLeft <= 5 && (
                    <span style={{ marginLeft: 5, background: '#FCD34D', color: '#92400E', borderRadius: 6, padding: '1px 6px', fontSize: 9.5, fontWeight: 800 }}>
                      {daysLeft === 0 ? 'hoy' : daysLeft === 1 ? 'mañana' : `${daysLeft}d`}
                    </span>
                  )}
                </div>
              )}
              {products.length > 0 && (
                <div style={S.chip}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                  {products.length} producto{products.length !== 1 ? 's' : ''} · Total {fmt(totalValue)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── URGENTE ── */}
        {reorder.length > 0 && (
          <div className="pc" style={S.urgentCard}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={S.urgentBadge}>RE-ORDEN</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#7C2D12', lineHeight: 1.3 }}>
                  {reorder.length} producto{reorder.length !== 1 ? 's' : ''} requieren reposición urgente
                </div>
                <div style={{ fontSize: 12, color: '#9A3412', marginTop: 3, lineHeight: 1.5 }}>
                  Stock por debajo del mínimo. Confirmá disponibilidad y plazo a la brevedad.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {reorder.map((p, i) => (
                <div key={i} style={S.urgentRow}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#9A3412', marginLeft: 8 }}>
                      Stock {p.stock || 0} — mínimo {p.minStock} — faltan {Math.max(1, (p.minStock || 0) - (p.stock || 0))} u.
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#B91C1C', whiteSpace: 'nowrap' }}>{fmt(p.cost)}/u</span>
                </div>
              ))}
            </div>
            {reorderTotal > 0 && (
              <div style={S.urgentTotal}>
                <span style={{ fontSize: 12, color: '#78716C' }}>Estimado mínimo de reposición</span>
                <b style={{ fontSize: 16, color: '#1C1917' }}>{fmt(reorderTotal)}</b>
              </div>
            )}
            {wa('urgent') && (
              <a href={wa('urgent')} target="_blank" rel="noopener noreferrer" className="wa-confirm" style={S.btnUrgent}>
                <WaIcon /> Confirmar re-orden por WhatsApp
              </a>
            )}
          </div>
        )}

        {/* ── PRODUCTOS ── */}
        {products.length > 0 && (
          <div className="pc" style={S.card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={S.cardTitle}>Detalle del pedido</div>
                <div style={S.cardSub}>Productos y precios acordados para esta operación</div>
              </div>
              <button onClick={copyAllProducts} className="pp-copy" style={S.copyBtn}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {copied
                    ? <polyline points="20 6 9 17 4 12" />
                    : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>
                  }
                </svg>
                {copied ? 'Copiado' : 'Copiar lista'}
              </button>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #EDE9FE' }}>
              <table style={S.table}>
                <thead>
                  <tr style={{ background: '#F5F3FF' }}>
                    <th style={S.th}>Producto</th>
                    <th style={{ ...S.th, textAlign: 'center', width: 90 }}>Estado</th>
                    <th style={{ ...S.th, textAlign: 'right', width: 130 }}>Precio acordado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={i} className="pp-row" style={{ ...S.tr, background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={S.td}>
                        <span style={{ fontWeight: 600, color: '#111827', fontSize: 13.5 }}>{p.name}</span>
                        {p.cat && <span style={{ fontSize: 10.5, color: '#9CA3AF', marginLeft: 8 }}>{p.cat}</span>}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        {p.reorder
                          ? <span style={S.badgeWarn}>Reponer</span>
                          : <span style={S.badgeOk}>Activo</span>
                        }
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
                        {fmt(p.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F5F3FF', borderTop: '2px solid #EDE9FE' }}>
                    <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11.5, color: '#7C3AED', fontWeight: 600 }}>
                      {products.length} producto{products.length !== 1 ? 's' : ''} · Precios en pesos argentinos
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totalValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── CONDICIONES ── */}
        <div className="pc" style={S.card}>
          <div style={S.cardTitle}>Condiciones del pedido</div>
          <div style={S.cardSub}>Plazos y forma de pago para esta operación</div>
          <div style={S.condsGrid}>
            <div style={S.condItem}>
              <div style={S.condIconWrap}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.condLabel}>Condición de pago</div>
                <div style={S.condValue}>
                  {data.paymentTerm
                    ? <><b style={{ color: '#111827' }}>{data.paymentTerm}</b> <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>días</span></>
                    : <span style={{ color: '#9CA3AF' }}>{data.paymentConditions || 'A coordinar'}</span>
                  }
                </div>
              </div>
            </div>
            <div style={S.condItem}>
              <div style={S.condIconWrap}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.condLabel}>Plazo de entrega (lead time)</div>
                <div style={S.condValue}>
                  {data.leadTime
                    ? <><b style={{ color: '#111827' }}>{data.leadTime}</b> <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>días hábiles</span></>
                    : <span style={{ color: '#9CA3AF' }}>A coordinar</span>
                  }
                </div>
              </div>
            </div>
            {data.paymentConditions && data.paymentTerm && (
              <div style={{ ...S.condItem, gridColumn: '1/-1', borderTop: '1px solid #EDE9FE', paddingTop: 14 }}>
                <div style={S.condIconWrap}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={S.condLabel}>Notas de pago</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, marginTop: 3 }}>{data.paymentConditions}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── HISTORIAL DE PRECIOS ── */}
        {(data.priceHistory || []).length > 0 && (
          <div className="pc" style={S.card}>
            <div style={S.cardTitle}>Historial de precios</div>
            <div style={S.cardSub}>Variaciones registradas para referencia de ambas partes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14 }}>
              {data.priceHistory.slice(0, 6).map((h, i) => {
                const pct = h.prevCost > 0 ? ((h.newCost - h.prevCost) / h.prevCost) * 100 : 0
                const up  = pct > 0
                return (
                  <div key={i} style={S.histRow}>
                    <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 72, fontVariantNumeric: 'tabular-nums' }}>{h.date}</span>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#374151', minWidth: 80 }}>{h.productName}</span>
                    <span style={{ fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmt(h.prevCost)} → <b style={{ color: '#111827' }}>{fmt(h.newCost)}</b>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                      color: up ? '#DC2626' : '#16A34A',
                      background: up ? '#FEF2F2' : '#F0FDF4',
                    }}>
                      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── CTA CONFIRMACIÓN ── */}
        <div className="pc" style={S.ctaCard}>
          {confirmed ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 6 }}>¡Confirmación enviada!</div>
              <div style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.55 }}>
                {data.ownerName || 'Tu cliente'} recibirá tu mensaje por WhatsApp en instantes.
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={S.ctaTitle}>¿Podés cumplir con este pedido?</div>
                <div style={S.ctaSub}>
                  Revisá los productos y condiciones. Si todo está OK, confirmá con un clic.
                  Si necesitás ajustar algo, escribinos antes de avanzar.
                </div>
              </div>
              <div style={S.ctaRow}>
                {wa('confirm') ? (
                  <a href={wa('confirm')} target="_blank" rel="noopener noreferrer"
                    onClick={() => setConfirmed(true)} className="wa-confirm" style={S.btnConfirm}>
                    <WaIcon size={18} />
                    Confirmar disponibilidad
                  </a>
                ) : (
                  <button disabled style={{ ...S.btnConfirm, opacity: .45, cursor: 'not-allowed' }}>
                    <WaIcon size={18} /> Confirmar disponibilidad
                  </button>
                )}
                {wa('ask') && (
                  <a href={wa('ask')} target="_blank" rel="noopener noreferrer" className="wa-ask" style={S.btnAsk}>
                    <WaIcon size={15} color="#7C3AED" />
                    Tengo una consulta
                  </a>
                )}
              </div>
              <div style={S.ctaTip}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: .6 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Tu respuesta va directo a {data.ownerName || 'tu cliente'} por WhatsApp.
                No almacenamos tu número ni lo compartimos con terceros.
              </div>
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={S.foot}>
          <span>Generado con</span>
          <b style={{ color: '#7C3AED' }}>ANMA Regalos</b>
          <span style={S.dot} />
          <span>Solo lectura · Sin registro</span>
          <span style={S.dot} />
          <a href="https://anma-host.vercel.app" target="_blank" rel="noopener noreferrer" style={S.footLink}>
            ¿Querés algo así para tu negocio?
          </a>
        </div>

      </div>
    </div>
  )
}

/* ── WhatsApp SVG inline ── */
function WaIcon({ size = 16, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

/* ── STYLES ── */
const S = {
  wrap: {
    minHeight: '100vh',
    background: '#F4F3FA',
    fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
    padding: '20px 14px 48px',
  },
  container: { maxWidth: 680, margin: '0 auto' },

  /* hero */
  hero: {
    position: 'relative',
    background: 'linear-gradient(135deg, #1E1144 0%, #2D1B69 55%, #3B1578 100%)',
    borderRadius: 20,
    padding: '28px 28px 32px',
    marginBottom: 12,
    overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(30,17,68,.30)',
  },
  heroCircle: {
    position: 'absolute', top: -50, right: -50,
    width: 200, height: 200, borderRadius: '50%',
    background: 'rgba(124,58,237,.18)',
    pointerEvents: 'none',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center',
    background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,.75)', fontSize: 10.5, fontWeight: 700,
    letterSpacing: '1px', textTransform: 'uppercase',
    padding: '4px 12px', borderRadius: 20, marginBottom: 12,
    border: '1px solid rgba(255,255,255,.12)',
  },
  heroTitle: {
    margin: '0 0 10px', fontSize: 26, fontWeight: 800,
    color: '#fff', letterSpacing: '-.5px', lineHeight: 1.2,
  },
  heroSub: {
    margin: '0 0 18px', fontSize: 14, color: 'rgba(255,255,255,.78)',
    lineHeight: 1.6,
  },
  heroChips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
    color: 'rgba(255,255,255,.85)', fontSize: 11.5, fontWeight: 600,
    padding: '5px 11px', borderRadius: 20, backdropFilter: 'blur(6px)',
  },

  /* urgente */
  urgentCard: {
    background: '#FFF7ED',
    border: '1.5px solid #FED7AA',
    borderRadius: 16, padding: '18px 20px',
    marginBottom: 12,
    boxShadow: '0 4px 16px rgba(220,38,38,.08)',
  },
  urgentBadge: {
    background: '#DC2626', color: '#fff',
    fontSize: 10, fontWeight: 800, letterSpacing: '.8px',
    padding: '4px 10px', borderRadius: 8,
    flexShrink: 0, height: 'fit-content',
  },
  urgentRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px', background: '#FEF2F2',
    borderRadius: 10, border: '1px solid #FECACA',
    fontSize: 13, color: '#1C1917',
  },
  urgentTotal: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', background: '#FFF', border: '1px solid #FED7AA',
    borderRadius: 10, marginBottom: 14,
  },
  btnUrgent: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', boxSizing: 'border-box',
    background: 'linear-gradient(135deg,#DC2626,#B91C1C)',
    color: '#fff', padding: '13px 20px', borderRadius: 12,
    textDecoration: 'none', fontWeight: 700, fontSize: 14,
    boxShadow: '0 6px 18px rgba(220,38,38,.30)',
  },

  /* card genérica */
  card: {
    background: '#fff',
    border: '1px solid #EDE9FE',
    borderRadius: 16, padding: '20px 22px',
    marginBottom: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,.04)',
  },
  cardTitle: { fontSize: 15, fontWeight: 800, color: '#111827', letterSpacing: '-.2px', marginBottom: 3 },
  cardSub:   { fontSize: 12, color: '#9CA3AF', marginBottom: 0 },

  /* copy btn */
  copyBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#F5F3FF', border: '1px solid #DDD6FE',
    color: '#7C3AED', fontSize: 11.5, fontWeight: 700,
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s',
  },

  /* table */
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 360 },
  th: {
    textAlign: 'left', padding: '10px 14px',
    fontSize: 10, color: '#7C3AED', fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '.7px',
  },
  tr:   { borderBottom: '1px solid #F5F3FF', transition: 'background .12s' },
  td:   { padding: '12px 14px', verticalAlign: 'middle' },
  badgeOk: {
    display: 'inline-block', background: '#F0FDF4', color: '#16A34A',
    fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
    padding: '3px 9px', borderRadius: 20,
  },
  badgeWarn: {
    display: 'inline-block', background: '#FEF2F2', color: '#DC2626',
    fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
    padding: '3px 9px', borderRadius: 20,
  },

  /* condiciones */
  condsGrid: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 },
  condItem: { display: 'flex', alignItems: 'flex-start', gap: 14 },
  condIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    background: '#F5F3FF', border: '1px solid #EDE9FE',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  condLabel: { fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 },
  condValue: { fontSize: 16, fontWeight: 700, color: '#374151', lineHeight: 1.3 },

  /* historial */
  histRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', background: '#FAFAFA',
    border: '1px solid #F3F4F6', borderRadius: 9,
    flexWrap: 'wrap',
  },

  /* CTA */
  ctaCard: {
    background: '#fff',
    border: '1.5px solid #EDE9FE',
    borderRadius: 16, padding: '24px 22px',
    marginBottom: 12,
    boxShadow: '0 4px 20px rgba(124,58,237,.08)',
  },
  ctaTitle: { fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-.3px', marginBottom: 8 },
  ctaSub:   { fontSize: 13.5, color: '#6B7280', lineHeight: 1.6, marginBottom: 0 },
  ctaRow:   { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  btnConfirm: {
    flex: '1 1 200px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    background: 'linear-gradient(135deg,#16A34A,#15803D)',
    color: '#fff', padding: '14px 22px', borderRadius: 13,
    textDecoration: 'none', fontWeight: 700, fontSize: 14.5,
    boxShadow: '0 6px 20px rgba(22,163,74,.28)',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnAsk: {
    flex: '1 1 160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: '#F5F3FF', border: '1.5px solid #DDD6FE',
    color: '#7C3AED', padding: '13px 18px', borderRadius: 13,
    textDecoration: 'none', fontWeight: 700, fontSize: 13.5,
  },
  ctaTip: {
    display: 'flex', alignItems: 'flex-start', gap: 7,
    fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.5,
    background: '#FAFAFA', padding: '9px 13px', borderRadius: 9,
    border: '1px solid #F3F4F6',
  },

  /* footer */
  foot: {
    textAlign: 'center', fontSize: 11.5, color: '#9CA3AF',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, flexWrap: 'wrap', padding: '10px 0 4px',
  },
  dot: { width: 3, height: 3, borderRadius: '50%', background: '#D1D5DB', display: 'inline-block' },
  footLink: { color: '#7C3AED', textDecoration: 'none', fontWeight: 600 },

  /* error / loading */
  fullCenter: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, fontFamily: "'Inter',sans-serif", background: '#F4F3FA',
  },
  msgCard: {
    maxWidth: 400, textAlign: 'center', background: '#fff',
    padding: '36px 28px', borderRadius: 18,
    boxShadow: '0 8px 32px rgba(0,0,0,.07)',
    border: '1px solid #EDE9FE',
  },
  spinner: {
    width: 30, height: 30, borderRadius: '50%',
    border: '3px solid #EDE9FE', borderTopColor: '#7C3AED',
    animation: 'pp-spin 1s linear infinite',
  },
}
