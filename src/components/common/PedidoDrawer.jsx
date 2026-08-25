/* ═══════════════════════════════════════════════════════════════════
   PedidoDrawer — vista lateral de lectura rápida del pedido.
   ─────────────────────────────────────────────────────────────────
   Patrón moderno estilo Notion/Linear/Stripe: side sheet a la derecha
   con el detalle en modo lectura, sin bloquear la lista. Complementa
   al form de edición — un click y ves todo; otro click y editás.

   Fuente de verdad UNIFICADA:
     · getEstado(b)           → mismo enum que tabs y badges
     · pedidoFromBudget(b)    → mismo adaptador que el editor
     · calcularTotales(p)     → mismos números que el bloque Precio
═══════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react'
import { fmt } from '../../lib/storage'
import {
  pedidoFromBudget, calcularTotales, eventosPedido,
  ESTADO_LABELS, TAG_LABELS,
} from '../../lib/pedido'
import { getEstado } from '../../lib/pedido'

const ESTADO_COLOR = {
  consulta:      '#94A3B8',
  presupuestado: '#3B82F6',
  pausado:       '#D97706',
  confirmado:    '#16A34A',
  produccion:    '#7C3AED',
  entregado:     '#059669',
  cerrado:       '#6B7280',
  perdido:       '#DC2626',
}

const PAY_LABEL = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' }
const PAY_COLOR = { pending: '#DC2626', partial: '#D97706', paid: '#16A34A' }

const TAGS_PROD  = new Set(['producto', 'packaging'])
const TAGS_COSTO = new Set(['manoDeObra', 'diseno', 'envio', 'otro'])

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

// Fecha + hora relativa para los hitos del timeline
const fmtEvento = (ts) => {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  const fecha = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const diff = Date.now() - Number(ts)
  const dias = Math.floor(diff / 86400000)
  const rel = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias}d`
  return `${fecha} · ${rel}`
}

export default function PedidoDrawer({ budget, onClose, onEdit, onWA, onVerCliente, onRegistrarPago }) {
  useEffect(() => {
    if (!budget) return
    const onEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    // Bloquea scroll del body mientras el drawer está abierto
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prev
    }
  }, [budget, onClose])

  if (!budget) return null

  const pedido   = pedidoFromBudget(budget)
  const totales  = calcularTotales(pedido)
  const estado   = getEstado(budget)
  const eColor   = ESTADO_COLOR[estado] || '#94A3B8'
  const productos = pedido.lineas.filter(l => TAGS_PROD.has(l.tag || 'producto'))
  const costos    = pedido.lineas.filter(l => TAGS_COSTO.has(l.tag))
  const timeline  = eventosPedido(budget)
  const payStatus = budget.payStatus || 'pending'
  const pagos     = Array.isArray(budget.payments) ? budget.payments : []
  const cobrado   = pagos.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const saldo     = Math.max(0, (totales.total || 0) - cobrado - (pedido.seniaMonto || 0))

  return (
    <>
      {/* Overlay oscuro clickeable */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)',
          zIndex: 500, animation: 'drawerFade .2s ease both',
        }}
      />

      {/* Sheet lateral derecho */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(520px, 100vw)', background: 'var(--surface)',
          zIndex: 501, display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 40px rgba(15,23,42,.15)',
          animation: 'drawerIn .28s cubic-bezier(.16,1,.3,1) both',
        }}
      >

        {/* ── HEADER sticky ── */}
        <header style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.5px', color: 'var(--txt)' }}>
                {budget.num || '—'}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: eColor + '18', color: eColor, border: `1px solid ${eColor}30`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: eColor }} />
                {ESTADO_LABELS[estado]}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 500 }}>
              {budget.company || budget.contact || 'Sin cliente'}
              {budget.company && budget.contact && (
                <span style={{ color: 'var(--txt3)' }}> · {budget.contact}</span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            title="Cerrar (Esc)"
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'var(--surface2)', color: 'var(--txt2)',
              cursor: 'pointer', fontSize: 14, flexShrink: 0,
            }}>
            <i className="fa fa-xmark" />
          </button>
        </header>

        {/* ── BODY scrolleable ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

          {/* Info clave */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <MiniKpi icon="fa-calendar-day" label="Fecha" value={fmtFecha(budget.date)} />
            <MiniKpi icon="fa-gift" label="Ocasión" value={budget.ocasion || '—'} />
            <MiniKpi icon="fa-truck-fast" label="Entrega" value={fmtFecha(budget.deliveryDate)} />
            <MiniKpi icon="fa-comment-dots" label="WhatsApp" value={budget.wa || '—'} />
          </div>

          {/* ── PRODUCTOS ── */}
          <SectionHead icon="fa-list-check" title="Productos" count={productos.length} />
          {productos.length === 0
            ? <EmptyRow text="Sin productos cargados" />
            : (
              <ItemTable
                items={productos}
                extra={pedido.esKit ? `Kit × ${pedido.cantKits} unidades` : null}
              />
            )
          }

          {/* ── COSTOS OPERATIVOS ── */}
          {costos.length > 0 && (
            <>
              <SectionHead icon="fa-briefcase" title="Costos operativos" count={costos.length} />
              <ItemTable items={costos} withTag />
            </>
          )}

          {/* ── PRECIO ── */}
          <SectionHead icon="fa-coins" title="Precio" />
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 18 }}>
            <MoneyRow label="Subtotal" value={fmt(totales.subtotal)} />
            {pedido.aplicaIva && <MoneyRow label="IVA 21%" value={fmt(totales.iva)} />}
            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
            <MoneyRow label="TOTAL" value={fmt(totales.total)} strong big />
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--txt3)' }}>
              <span>Costo <b style={{ color: 'var(--txt2)' }}>{fmt(totales.costoTotal)}</b></span>
              <span>Ganancia <b style={{ color: totales.ganancia >= 0 ? '#15803d' : '#dc2626' }}>{fmt(totales.ganancia)}</b></span>
              <span>Margen <b style={{ color: 'var(--txt2)' }}>{totales.margen}%</b></span>
            </div>
          </div>

          {/* ── COBRO ── */}
          <SectionHead icon="fa-hand-holding-dollar" title="Cobro" />
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--txt3)' }}>Estado</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: PAY_COLOR[payStatus] + '15', color: PAY_COLOR[payStatus],
                border: `1px solid ${PAY_COLOR[payStatus]}30`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PAY_COLOR[payStatus] }} />
                {PAY_LABEL[payStatus]}
              </span>
            </div>
            {pedido.seniaMonto > 0 && <MoneyRow label="Seña" value={fmt(pedido.seniaMonto)} />}
            {cobrado > 0 && <MoneyRow label={`Cobrado (${pagos.length} pago${pagos.length > 1 ? 's' : ''})`} value={fmt(cobrado)} />}
            <MoneyRow label="Saldo pendiente" value={fmt(saldo)} strong={saldo > 0} />
            {onRegistrarPago && payStatus !== 'paid' && (
              <button onClick={() => onRegistrarPago(budget)}
                style={{
                  width: '100%', marginTop: 10, padding: '9px 12px',
                  background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC',
                  borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                <i className="fa fa-hand-holding-dollar" /> Registrar pago
              </button>
            )}
          </div>

          {/* ── ENTREGA ── */}
          <SectionHead icon="fa-truck-fast" title="Entrega" />
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: 'var(--txt2)', lineHeight: 1.7 }}>
            <div><b style={{ color: 'var(--txt3)', fontWeight: 600, marginRight: 6 }}>Fecha:</b> {fmtFecha(budget.deliveryDate)}</div>
            <div><b style={{ color: 'var(--txt3)', fontWeight: 600, marginRight: 6 }}>Horario:</b> {budget.deliveryTime || '—'}</div>
            <div><b style={{ color: 'var(--txt3)', fontWeight: 600, marginRight: 6 }}>Dirección:</b> {budget.deliveryAddress || '—'}</div>
            <div><b style={{ color: 'var(--txt3)', fontWeight: 600, marginRight: 6 }}>Contacto:</b> {budget.deliveryContact || '—'}</div>
          </div>

          {/* ── NOTA INTERNA ── */}
          {(budget.noteInt || pedido.notaInterna) && (
            <>
              <SectionHead icon="fa-pen-to-square" title="Nota interna" />
              <div style={{
                background: '#FEF3C7', border: '1px solid #FDE68A',
                borderRadius: 10, padding: '10px 14px', marginBottom: 18,
                fontSize: 12, color: '#78350F', whiteSpace: 'pre-wrap', lineHeight: 1.5,
              }}>
                {budget.noteInt || pedido.notaInterna}
              </div>
            </>
          )}

          {/* ── TIMELINE ── */}
          <SectionHead icon="fa-clock-rotate-left" title="Historial" />
          <div style={{ padding: '4px 4px 14px 6px', marginBottom: 14 }}>
            {timeline.map((ev, i) => {
              const color = ev.type === 'estado' ? (ESTADO_COLOR[ev.estado] || 'var(--brand)')
                          : ev.type === 'pago' ? '#16A34A' : 'var(--txt3)'
              const icon = ev.type === 'creado' ? 'fa-plus'
                         : ev.type === 'pago' ? 'fa-hand-holding-dollar' : 'fa-circle'
              const isLast = i === timeline.length - 1
              return (
                <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                  {/* Línea vertical conectora */}
                  {!isLast && (
                    <div style={{ position: 'absolute', left: 9, top: 20, bottom: -6, width: 2, background: 'var(--border)' }} />
                  )}
                  {/* Punto */}
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                    background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9,
                  }}>
                    <i className={`fa ${icon}`} />
                  </div>
                  {/* Texto */}
                  <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>{ev.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{fmtEvento(ev.at)}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Link al perfil del cliente */}
          {onVerCliente && (budget.company || budget.contact) && (
            <button onClick={onVerCliente}
              style={{
                width: '100%', padding: '10px 12px', marginTop: 4,
                background: 'transparent', border: '1px dashed var(--border2)',
                borderRadius: 10, cursor: 'pointer', fontSize: 12,
                color: 'var(--txt3)', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--brand)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--txt3)' }}>
              <i className="fa fa-user" />
              Ver todos los pedidos de este cliente
            </button>
          )}
        </div>

        {/* ── FOOTER sticky ── */}
        <footer style={{
          padding: '14px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, background: 'var(--surface)',
        }}>
          <button onClick={onEdit} className="btn btn-primary" style={{ flex: 1 }}>
            <i className="fa fa-pen" /> Editar pedido
          </button>
          {budget.wa && (
            <button onClick={onWA}
              title="Enviar por WhatsApp"
              style={{
                padding: '8px 14px', borderRadius: 10, border: 'none',
                background: '#25D366', color: '#fff', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <i className="fa-brands fa-whatsapp" /> WA
            </button>
          )}
        </footer>
      </aside>

      <style>{`
        @keyframes drawerFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes drawerIn   { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
    </>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────

function SectionHead({ icon, title, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4,
      fontSize: 10, fontWeight: 800, color: 'var(--txt3)',
      textTransform: 'uppercase', letterSpacing: '.08em',
    }}>
      <i className={`fa ${icon}`} style={{ color: 'var(--brand)', fontSize: 11 }} />
      {title}
      {typeof count === 'number' && (
        <span style={{
          padding: '1px 7px', fontSize: 10, fontWeight: 700,
          background: 'var(--surface2)', color: 'var(--txt2)',
          borderRadius: 999,
        }}>{count}</span>
      )}
    </div>
  )
}

function MiniKpi({ icon, label, value }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 3 }}>
        <i className={`fa ${icon}`} style={{ fontSize: 10 }} />
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{value}</div>
    </div>
  )
}

function EmptyRow({ text }) {
  return (
    <div style={{
      padding: '12px 14px', marginBottom: 18,
      background: 'var(--surface2)', border: '1px dashed var(--border2)',
      borderRadius: 10, fontSize: 12, color: 'var(--txt3)', textAlign: 'center', fontStyle: 'italic',
    }}>
      {text}
    </div>
  )
}

function ItemTable({ items, extra, withTag }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden', marginBottom: 18,
    }}>
      {items.map((it, i) => {
        const cant = Number(it.cantidad) || 0
        const cu   = Number(it.costoUnit) || 0
        const pu   = Number(it.precioUnit) || 0
        const subt = it.esCostoUnico ? pu : pu * cant
        return (
          <div key={it.id || i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 6,
            padding: '10px 14px', fontSize: 12,
            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.descripcion || '(sin descripción)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                {withTag && (<><b style={{ color: 'var(--txt2)', fontWeight: 600 }}>{TAG_LABELS[it.tag] || 'Otro'}</b> · </>)}
                {cant} × {fmt(cu)} <span style={{ color: 'var(--txt4)' }}>costo</span>
                {pu > 0 && <> · {cant} × {fmt(pu)} <span style={{ color: 'var(--txt4)' }}>precio</span></>}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: 'var(--txt)', textAlign: 'right', alignSelf: 'center', whiteSpace: 'nowrap' }}>
              {fmt(subt)}
            </div>
          </div>
        )
      })}
      {extra && (
        <div style={{ padding: '8px 14px', fontSize: 11, background: 'var(--brand-xlt)', color: 'var(--brand)', borderTop: '1px solid var(--border)', textAlign: 'center', fontWeight: 700 }}>
          <i className="fa fa-gift" style={{ marginRight: 6 }} />{extra}
        </div>
      )}
    </div>
  )
}

function MoneyRow({ label, value, strong, big }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: big ? 15 : 12, marginBottom: 4,
    }}>
      <span style={{ color: strong ? 'var(--txt)' : 'var(--txt3)', fontWeight: strong ? 800 : 500, letterSpacing: strong ? '.05em' : 'normal', textTransform: strong ? 'uppercase' : 'none' }}>{label}</span>
      <span style={{ color: 'var(--txt)', fontWeight: strong ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
