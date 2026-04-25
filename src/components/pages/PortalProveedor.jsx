import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Portal público de proveedor (sin auth).
 * Lee datos serializados desde el query param ?d=BASE64.
 */
export default function PortalProveedor() {
  const loc = useLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const params = new URLSearchParams(loc.search)
      const d = params.get('d')
      if (!d) { setError('Link inválido o vencido'); return }
      const json = decodeURIComponent(escape(atob(d.replace(/-/g, '+').replace(/_/g, '/'))))
      const parsed = JSON.parse(json)
      if (parsed.exp && Date.now() > parsed.exp) {
        setError('Este link ya venció. Pedile a tu clienta que te genere uno nuevo.')
        return
      }
      setData(parsed)
    } catch (e) {
      setError('No se pudo abrir el link. Verificá que esté completo.')
    }
  }, [loc.search])

  const fmt = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif', background: '#FDF4FF' }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', color: '#1F1338', fontSize: 18 }}>Link no válido</h2>
        <p style={{ color: '#6B5B8C', fontSize: 14, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#6B5B8C' }}>Cargando portal...</div>

  const reorder = (data.products || []).filter(p => p.reorder)
  const expDate = data.exp ? new Date(data.exp).toLocaleDateString('es-AR') : null

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #FDF4FF 0%, #FCE7F3 100%)', fontFamily: 'system-ui, sans-serif', padding: '20px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(135deg, #DB2777 0%, #9333EA 100%)', borderRadius: 16, padding: '24px 24px 28px', color: '#fff', marginBottom: 16, boxShadow: '0 8px 30px rgba(219,39,119,.2)' }}>
          <div style={{ fontSize: 11, opacity: .85, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 6 }}>Portal de Proveedora</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-.5px' }}>Hola {data.contact || data.supplierName} 🎁</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, opacity: .92 }}>
            <b>{data.ownerName || 'Tu clienta'}</b> te comparte este resumen de su operación con vos.
          </p>
          {expDate && <div style={{ fontSize: 11, opacity: .7, marginTop: 12 }}>📅 Válido hasta {expDate}</div>}
        </div>

        {reorder.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, border: '2px solid #DC2626', boxShadow: '0 4px 14px rgba(220,38,38,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ background: '#DC2626', color: '#fff', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>URGENTE</span>
              <h3 style={{ margin: 0, fontSize: 15, color: '#1F1338' }}>Necesito reponer {reorder.length} producto{reorder.length !== 1 ? 's' : ''}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reorder.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#FEF2F2', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, fontWeight: 600, color: '#1F1338' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>Stock: {p.stock}/{p.minStock}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(data.products || []).length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,.04)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#1F1338' }}>📦 Productos que te compro</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #F3E8FF' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#6B5B8C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Producto</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#6B5B8C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Precio acordado</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #FAF5FF' }}>
                    <td style={{ padding: '10px 6px', color: '#1F1338' }}>
                      {p.name}
                      {p.reorder && <span style={{ marginLeft: 6, fontSize: 9, background: '#FEE2E2', color: '#DC2626', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>RE-ORDEN</span>}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, color: '#DB2777' }}>{fmt(p.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data.priceHistory || []).length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,.04)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#1F1338' }}>📊 Últimos cambios de precio</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.priceHistory.slice(0, 8).map((h, i) => {
                const pct = h.prevCost > 0 ? ((h.newCost - h.prevCost) / h.prevCost) * 100 : 0
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#FAF5FF', borderRadius: 8, fontSize: 12 }}>
                    <span style={{ color: '#A78BFA', fontSize: 11 }}>{h.date}</span>
                    <span style={{ flex: 1, color: '#1F1338', fontWeight: 600 }}>{h.productName}</span>
                    <span style={{ color: '#6B5B8C' }}>{fmt(h.prevCost)} → <b>{fmt(h.newCost)}</b></span>
                    <span style={{ color: pct > 0 ? '#DC2626' : '#16A34A', fontWeight: 700, fontSize: 11 }}>
                      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {(data.paymentTerm || data.leadTime) && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,.04)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#1F1338' }}>⚙️ Condiciones acordadas</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {data.paymentTerm && (
                <div style={{ background: '#FAF5FF', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#6B5B8C', textTransform: 'uppercase', fontWeight: 700 }}>Plazo de pago</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1338', marginTop: 2 }}>{data.paymentTerm} días</div>
                </div>
              )}
              {data.leadTime && (
                <div style={{ background: '#FAF5FF', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#6B5B8C', textTransform: 'uppercase', fontWeight: 700 }}>Lead time</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1338', marginTop: 2 }}>{data.leadTime} días</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,.04)', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#1F1338' }}>¿Confirmás que podés cumplir?</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B5B8C' }}>Avisanos por WhatsApp</p>
          {data.ownerWa && (
            <a href={`https://wa.me/${data.ownerWa.replace(/\D/g, '')}?text=${encodeURIComponent('Hola ' + (data.ownerName || '') + ', vi el portal y te confirmo que ')}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16A34A', color: '#fff', padding: '12px 22px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 14px rgba(22,163,74,.3)' }}>
              <span style={{ fontSize: 18 }}>📱</span> Confirmar por WhatsApp
            </a>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#A78BFA', padding: '14px 0' }}>
          Generado con <b style={{ color: '#DB2777' }}>ANMA Regalos</b> · Información de solo lectura
        </div>
      </div>
    </div>
  )
}
