import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Portal público de proveedor — v3
 * Diseño sobrio profesional. Color toma el brandColor del cliente.
 * Sin auth. Datos via ?d=BASE64 (payload corto v2 con keys abreviadas).
 */

/* hex → variantes derivadas del brand */
function hexToRgb(hex) {
  const h = (hex || '#7C3AED').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function mix(hex, target, ratio) {
  const a = hexToRgb(hex), b = hexToRgb(target)
  const r = Math.round(a.r + (b.r - a.r) * ratio)
  const g = Math.round(a.g + (b.g - a.g) * ratio)
  const bl = Math.round(a.b + (b.b - a.b) * ratio)
  return `rgb(${r},${g},${bl})`
}
function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export default function PortalProveedor() {
  const loc = useLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      const p = new URLSearchParams(loc.search)
      const d = p.get('d')
      if (!d) { setError('Link inválido o vencido.'); return }
      const json = decodeURIComponent(escape(atob(d.replace(/-/g, '+').replace(/_/g, '/'))))
      const raw = JSON.parse(json)

      // Normaliza payload v2 (keys cortas) y v1 (keys largas — backward compat)
      const norm = {
        supplierName: raw.s || raw.supplierName || '',
        contact:      raw.c || raw.contact || '',
        paymentTerm:  raw.pt || raw.paymentTerm || '',
        leadTime:     raw.lt || raw.leadTime || '',
        ownerName:    raw.o || raw.ownerName || '',
        ownerWa:      raw.w || raw.ownerWa || '',
        brandColor:   raw.bc || raw.brandColor || '#1E293B',
        introCopy:    raw.cp || raw.portalIntroCopy || '',
        exp:          raw.e || raw.exp || 0,
        products:     (raw.p || raw.products || []).map(pr => ({
          name:     pr.n  || pr.name || '',
          cost:     pr.c ?? pr.cost ?? 0,
          stock:    pr.st ?? pr.stock ?? 0,
          minStock: pr.m  ?? pr.minStock ?? 0,
          reorder:  pr.r === 1 || pr.reorder === true,
        })),
      }
      if (norm.exp && Date.now() > norm.exp) {
        setError('Este enlace venció. Pedile a tu cliente que genere uno nuevo.')
        return
      }
      setData(norm)
    } catch {
      setError('No se pudo abrir el enlace. Verificá que esté completo.')
    }
  }, [loc.search])

  const fmt = n => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const products = data?.products || []
  const reorder = useMemo(() => products.filter(p => p.reorder), [products])
  const totalUnits = useMemo(() => products.reduce((s, p) => s + Math.max(1, p.stock || 0), 0), [products])
  const totalValue = useMemo(() => products.reduce((s, p) => s + (Number(p.cost) || 0) * Math.max(1, p.stock || 0), 0), [products])
  const reorderTotal = useMemo(() =>
    reorder.reduce((s, p) => s + (Number(p.cost) || 0) * Math.max(1, (p.minStock || 0) - (p.stock || 0)), 0),
    [reorder])

  const expDate = data?.exp ? new Date(data.exp).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : null
  const daysLeft = data?.exp ? Math.max(0, Math.ceil((data.exp - Date.now()) / 86400000)) : null

  const buildMsg = type => {
    const owner = data?.ownerName || 'tu cliente'
    const lista = products.slice(0, 4).map(p => p.name).join(', ') + (products.length > 4 ? ` y ${products.length - 4} más` : '')
    if (type === 'confirm') return encodeURIComponent(`Hola ${owner}! Revisé el portal y confirmo disponibilidad para: ${lista}. Podemos avanzar.`)
    if (type === 'ask')     return encodeURIComponent(`Hola ${owner}! Revisé el portal del pedido y tengo una consulta antes de confirmar.`)
    if (type === 'urgent')  return encodeURIComponent(`Hola ${owner}! Vi el aviso de re-orden para: ${reorder.map(p => p.name).join(', ')}. Confirmo disponibilidad.`)
    return ''
  }
  const wa = type => data?.ownerWa
    ? `https://wa.me/${data.ownerWa.replace(/\D/g, '')}?text=${buildMsg(type)}`
    : null

  const copyAllProducts = () => {
    const lines = products.map(p => `• ${p.name} ${p.stock ? `(${p.stock} u.)` : ''} — ${fmt(p.cost)}${p.reorder ? ' [RE-ORDEN]' : ''}`).join('\n')
    const txt = `Pedido · ${data?.ownerName || 'cliente'}:\n\n${lines}\n\nTotal estimado: ${fmt(totalValue)}`
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200) })
  }

  // Brand-driven palette (sobrio, derivado del color del cliente)
  const brand = data?.brandColor || '#1E293B'
  const brandDark = mix(brand, '#000000', 0.25)
  const brandSoft = alpha(brand, 0.08)
  const brandLine = alpha(brand, 0.18)

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
        @keyframes pp-in   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes pp-spin { to{transform:rotate(360deg)} }
        .pc{ animation:pp-in .28s ease both }
        .pc:nth-child(2){animation-delay:.05s}.pc:nth-child(3){animation-delay:.10s}
        .pc:nth-child(4){animation-delay:.15s}.pc:nth-child(5){animation-delay:.20s}
        .pp-row:hover{ background:${brandSoft} !important }
        .wa-confirm{ transition:transform .15s, box-shadow .2s }
        .wa-confirm:hover{ transform:translateY(-1px); box-shadow:0 10px 24px rgba(22,163,74,.32) }
        .wa-ask:hover{ background:${brandSoft} !important; border-color:${brandLine} !important }
        .pp-copy:hover{ background:${brandSoft} !important; color:${brandDark} !important; border-color:${brandLine} !important }
      `}</style>

      <div style={S.container}>

        {/* ── HERO sobrio ── */}
        <div className="pc" style={{
          ...S.hero,
          background: `linear-gradient(135deg, #111827 0%, #1F2937 50%, ${brandDark} 100%)`,
          boxShadow: `0 12px 36px ${alpha(brand, 0.18)}`,
        }}>
          <div style={{
            ...S.heroAccentBar,
            background: `linear-gradient(90deg, ${brand}, ${alpha(brand, 0.4)})`,
          }} />
          <div style={{ position: 'relative' }}>
            <div style={S.heroBadge}>
              {data.ownerName ? data.ownerName : 'Portal de pedido'}
            </div>
            <h1 style={S.heroTitle}>
              Hola, {data.contact || data.supplierName}
            </h1>
            <p style={S.heroSub}>
              {data.introCopy
                ? data.introCopy
                : <>{data.ownerName ? <b style={{ color: '#fff' }}>{data.ownerName}</b> : 'Te'} te compartió el detalle de productos para esta operación. Revisá precios, cantidades, condiciones y confirmá disponibilidad.</>
              }
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
                  {products.length} producto{products.length !== 1 ? 's' : ''} · {totalUnits} u.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── URGENTE re-orden ── */}
        {reorder.length > 0 && (
          <div className="pc" style={S.urgentCard}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={S.urgentBadge}>RE-ORDEN</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#7C2D12', lineHeight: 1.3 }}>
                  {reorder.length} producto{reorder.length !== 1 ? 's' : ''} requieren reposición
                </div>
                <div style={{ fontSize: 12, color: '#9A3412', marginTop: 3, lineHeight: 1.5 }}>
                  Stock por debajo del mínimo. Confirmá disponibilidad y plazo.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {reorder.map((p, i) => (
                <div key={i} style={S.urgentRow}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#9A3412', marginLeft: 8 }}>
                      Stock {p.stock || 0} u · mínimo {p.minStock} u · faltan {Math.max(1, (p.minStock || 0) - (p.stock || 0))} u
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
          <div className="pc" style={{ ...S.card, borderColor: brandLine }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={S.cardTitle}>Detalle del pedido</div>
                <div style={S.cardSub}>Productos, cantidades y precios acordados</div>
              </div>
              <button onClick={copyAllProducts} className="pp-copy" style={{ ...S.copyBtn, background: brandSoft, borderColor: brandLine, color: brandDark }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {copied
                    ? <polyline points="20 6 9 17 4 12" />
                    : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>
                  }
                </svg>
                {copied ? 'Copiado' : 'Copiar lista'}
              </button>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${brandLine}` }}>
              <table style={S.table}>
                <thead>
                  <tr style={{ background: brandSoft }}>
                    <th style={{ ...S.th, color: brandDark }}>Producto</th>
                    <th style={{ ...S.th, color: brandDark, textAlign: 'center', width: 90 }}>Cantidad (u.)</th>
                    <th style={{ ...S.th, color: brandDark, textAlign: 'right', width: 110 }}>Precio u.</th>
                    <th style={{ ...S.th, color: brandDark, textAlign: 'right', width: 110 }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => {
                    const qty = Math.max(1, p.stock || 0)
                    return (
                      <tr key={i} className="pp-row" style={{ ...S.tr, background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={S.td}>
                          <span style={{ fontWeight: 600, color: '#111827', fontSize: 13.5 }}>{p.name}</span>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                          {qty}
                        </td>
                        <td style={{ ...S.td, textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                          {fmt(p.cost)}
                        </td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>
                          {fmt(p.cost * qty)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: brandSoft, borderTop: `2px solid ${brandLine}` }}>
                    <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11.5, color: brandDark, fontWeight: 600 }}>
                      {products.length} producto{products.length !== 1 ? 's' : ''} · {totalUnits} u. · ARS
                    </td>
                    <td colSpan={2} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totalValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── CONDICIONES ── */}
        <div className="pc" style={{ ...S.card, borderColor: brandLine }}>
          <div style={S.cardTitle}>Condiciones del pedido</div>
          <div style={S.cardSub}>Plazos y forma de pago para esta operación</div>
          <div style={S.condsGrid}>
            <div style={S.condItem}>
              <div style={{ ...S.condIconWrap, background: brandSoft, borderColor: brandLine }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={brandDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.condLabel}>Condición de pago</div>
                <div style={S.condValue}>
                  {data.paymentTerm
                    ? <><b style={{ color: '#111827' }}>{data.paymentTerm}</b> <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>días</span></>
                    : <span style={{ color: '#9CA3AF' }}>A coordinar</span>
                  }
                </div>
              </div>
            </div>
            <div style={S.condItem}>
              <div style={{ ...S.condIconWrap, background: brandSoft, borderColor: brandLine }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={brandDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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
          </div>
        </div>

        {/* ── CTA CONFIRMACIÓN ── */}
        <div className="pc" style={{ ...S.ctaCard, borderColor: brandLine, boxShadow: `0 4px 18px ${alpha(brand, 0.08)}` }}>
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
                  <a href={wa('ask')} target="_blank" rel="noopener noreferrer" className="wa-ask"
                    style={{ ...S.btnAsk, background: brandSoft, borderColor: brandLine, color: brandDark }}>
                    <WaIcon size={15} color={brandDark} />
                    Tengo una consulta
                  </a>
                )}
              </div>
              <div style={S.ctaTip}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: .6 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Tu respuesta va directo a {data.ownerName || 'tu cliente'} por WhatsApp.
              </div>
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={S.foot}>
          <span>Generado con</span>
          <b style={{ color: brandDark }}>{data.ownerName || 'ANMA'}</b>
          <span style={S.dot} />
          <span>Solo lectura · Sin registro</span>
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

/* ── STYLES (sobrios, neutrales — el color viene del cliente vía brand) ── */
const S = {
  wrap: {
    minHeight: '100vh',
    background: '#F8FAFC',
    fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
    padding: '20px 14px 48px',
  },
  container: { maxWidth: 680, margin: '0 auto' },

  /* hero — gris carbón con acento del brand */
  hero: {
    position: 'relative',
    borderRadius: 18,
    padding: '28px 28px 30px',
    marginBottom: 12,
    overflow: 'hidden',
  },
  heroAccentBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    pointerEvents: 'none',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center',
    background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,.85)', fontSize: 10.5, fontWeight: 700,
    letterSpacing: '1px', textTransform: 'uppercase',
    padding: '4px 12px', borderRadius: 6, marginBottom: 14,
    border: '1px solid rgba(255,255,255,.14)',
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
    background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.18)',
    color: 'rgba(255,255,255,.88)', fontSize: 11.5, fontWeight: 600,
    padding: '5px 11px', borderRadius: 6, backdropFilter: 'blur(6px)',
  },

  /* urgente */
  urgentCard: {
    background: '#FFF7ED',
    border: '1.5px solid #FED7AA',
    borderRadius: 14, padding: '18px 20px',
    marginBottom: 12,
  },
  urgentBadge: {
    background: '#DC2626', color: '#fff',
    fontSize: 10, fontWeight: 800, letterSpacing: '.8px',
    padding: '4px 10px', borderRadius: 6,
    flexShrink: 0, height: 'fit-content',
  },
  urgentRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px', background: '#FEF2F2',
    borderRadius: 8, border: '1px solid #FECACA',
    fontSize: 13, color: '#1C1917',
  },
  urgentTotal: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', background: '#FFF', border: '1px solid #FED7AA',
    borderRadius: 8, marginBottom: 14,
  },
  btnUrgent: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', boxSizing: 'border-box',
    background: 'linear-gradient(135deg,#DC2626,#B91C1C)',
    color: '#fff', padding: '13px 20px', borderRadius: 10,
    textDecoration: 'none', fontWeight: 700, fontSize: 14,
    boxShadow: '0 6px 18px rgba(220,38,38,.30)',
  },

  /* card genérica */
  card: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 14, padding: '20px 22px',
    marginBottom: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,.03)',
  },
  cardTitle: { fontSize: 15, fontWeight: 800, color: '#111827', letterSpacing: '-.2px', marginBottom: 3 },
  cardSub:   { fontSize: 12, color: '#9CA3AF', marginBottom: 0 },

  /* copy btn */
  copyBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    border: '1px solid #E5E7EB',
    background: '#F9FAFB', color: '#374151',
    fontSize: 11.5, fontWeight: 700,
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s',
  },

  /* table */
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 },
  th: {
    textAlign: 'left', padding: '10px 14px',
    fontSize: 10, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '.7px',
  },
  tr: { borderBottom: '1px solid #F3F4F6', transition: 'background .12s' },
  td: { padding: '12px 14px', verticalAlign: 'middle' },
  badgeOk: {
    display: 'inline-block', background: '#F0FDF4', color: '#16A34A',
    fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
    padding: '3px 9px', borderRadius: 6,
  },
  badgeWarn: {
    display: 'inline-block', background: '#FEF2F2', color: '#DC2626',
    fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
    padding: '3px 9px', borderRadius: 6,
  },

  /* condiciones */
  condsGrid: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 },
  condItem: { display: 'flex', alignItems: 'flex-start', gap: 14 },
  condIconWrap: {
    width: 34, height: 34, borderRadius: 8,
    border: '1px solid #E5E7EB',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  condLabel: { fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 },
  condValue: { fontSize: 16, fontWeight: 700, color: '#374151', lineHeight: 1.3 },

  /* CTA */
  ctaCard: {
    background: '#fff',
    border: '1.5px solid #E5E7EB',
    borderRadius: 14, padding: '24px 22px',
    marginBottom: 12,
  },
  ctaTitle: { fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-.3px', marginBottom: 8 },
  ctaSub:   { fontSize: 13.5, color: '#6B7280', lineHeight: 1.6, marginBottom: 0 },
  ctaRow:   { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  btnConfirm: {
    flex: '1 1 200px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    background: 'linear-gradient(135deg,#16A34A,#15803D)',
    color: '#fff', padding: '14px 22px', borderRadius: 10,
    textDecoration: 'none', fontWeight: 700, fontSize: 14.5,
    boxShadow: '0 6px 20px rgba(22,163,74,.28)',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnAsk: {
    flex: '1 1 160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    border: '1.5px solid #E5E7EB',
    padding: '13px 18px', borderRadius: 10,
    textDecoration: 'none', fontWeight: 700, fontSize: 13.5,
  },
  ctaTip: {
    display: 'flex', alignItems: 'flex-start', gap: 7,
    fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.5,
    background: '#F9FAFB', padding: '9px 13px', borderRadius: 8,
    border: '1px solid #F3F4F6',
  },

  /* footer */
  foot: {
    textAlign: 'center', fontSize: 11.5, color: '#9CA3AF',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, flexWrap: 'wrap', padding: '10px 0 4px',
  },
  dot: { width: 3, height: 3, borderRadius: '50%', background: '#D1D5DB', display: 'inline-block' },

  /* error / loading */
  fullCenter: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, fontFamily: "'Inter',sans-serif", background: '#F8FAFC',
  },
  msgCard: {
    maxWidth: 400, textAlign: 'center', background: '#fff',
    padding: '36px 28px', borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,.07)',
    border: '1px solid #E5E7EB',
  },
  spinner: {
    width: 30, height: 30, borderRadius: '50%',
    border: '3px solid #E5E7EB', borderTopColor: '#1F2937',
    animation: 'pp-spin 1s linear infinite',
  },
}
