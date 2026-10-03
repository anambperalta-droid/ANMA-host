// Agenda de recordatorios — client-side.
const DAY = 86400000
export function getRecordatorios(budgets) {
  const now = Date.now()
  const since = (b) => b.lastContactAt ? Math.floor((now - b.lastContactAt) / DAY) : 999
  const items = []
  for (const b of budgets || []) {
    const total = Number(b.totalFinal || b.total) || 0
    const pagos = Array.isArray(b.payments) ? b.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) : 0
    const saldo = Math.max(0, total - pagos)
    const d = since(b)
    if ((b.status === 'delivered' || b.estado === 'entregado') && b.payStatus !== 'paid' && saldo > 0 && d >= 7) {
      items.push({ b, cat: 'cobro', score: 100 + d, label: `Cobrá ${saldo.toLocaleString('es-AR')}`, days: d })
    } else if ((b.status === 'draft' || b.status === 'sent' || b.estado === 'presupuestado') && d >= 5) {
      items.push({ b, cat: 'frio', score: 50 + d, label: `Recontactá`, days: d })
    } else if ((b.status === 'confirmed' || b.estado === 'confirmado') && b.payStatus === 'pending' && d >= 3) {
      items.push({ b, cat: 'sena', score: 70 + d, label: `Pedí seña`, days: d })
    }
  }
  return items.sort((a, b) => b.score - a.score)
}
export const CAT_META = {
  cobro: { label: 'Cobros atrasados', color: '#DC2626', bg: '#FEE2E2', icon: 'fa-hand-holding-dollar' },
  sena:  { label: 'Señas pendientes', color: '#B45309', bg: '#FEF3C7', icon: 'fa-coins' },
  frio:  { label: 'Presupuestos fríos', color: '#2563EB', bg: '#DBEAFE', icon: 'fa-snowflake' },
}
