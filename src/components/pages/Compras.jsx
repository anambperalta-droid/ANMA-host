import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { fmt } from '../../lib/storage'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}` }
function compraMonth(c) {
  const d = c.fecha || new Date(c.updatedAt || Date.now()).toISOString().slice(0, 10)
  return d.slice(0, 7)
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtLive(v) {
  if (!v) return ''
  const clean = String(v).replace(/[^\d]/g, '')
  if (!clean) return ''
  return Number(clean).toLocaleString('es-AR')
}
function parseFmtValue(v) {
  return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
}

const EMPTY = { proveedor: '', concepto: '', cantidad: '', monto: '', fecha: todayISO(), recurrente: false, nota: '' }

export default function Compras() {
  const { get, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const { hidden } = usePrivacy()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draft, setDraft] = useState({ ...EMPTY })
  const [showNota, setShowNota] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [justSaved, setJustSaved] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
  const inputRef = useRef(null)

  const suppliers = get('suppliers') || []
  const allCompras = get('compras') || []
  const mk = monthKey(year, month)

  const monthCompras = useMemo(() =>
    allCompras.filter(c => compraMonth(c) === mk).sort((a, b) => {
      const da = a.fecha || ''
      const db = b.fecha || ''
      if (da !== db) return db.localeCompare(da)
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    }),
    [allCompras, mk]
  )

  const totals = useMemo(() => {
    let gastado = 0
    monthCompras.forEach(c => { gastado += Number(c.monto) || 0 })
    return { gastado, count: monthCompras.length }
  }, [monthCompras])

  const prevMonthData = useMemo(() => {
    const pm = month === 0 ? 11 : month - 1
    const py = month === 0 ? year - 1 : year
    const pmk = monthKey(py, pm)
    const arr = allCompras.filter(c => compraMonth(c) === pmk)
    return { count: arr.length, gastado: arr.reduce((s, c) => s + (Number(c.monto) || 0), 0) }
  }, [allCompras, month, year])

  const capDelta = (v) => v === null ? null : Math.max(-999, Math.min(999, v))
  const deltaCount = prevMonthData.count >= 3 ? capDelta(Math.round(((totals.count - prevMonthData.count) / prevMonthData.count) * 100)) : null
  const deltaGasto = prevMonthData.count >= 3 && prevMonthData.gastado > 0 ? capDelta(Math.round(((totals.gastado - prevMonthData.gastado) / prevMonthData.gastado) * 100)) : null

  const topProveedor = useMemo(() => {
    const rev = {}
    monthCompras.forEach(c => {
      const n = c.proveedor || ''
      if (n) rev[n] = (rev[n] || 0) + (Number(c.monto) || 0)
    })
    const e = Object.entries(rev)
    if (!e.length) return null
    e.sort((a, b) => b[1] - a[1])
    return { name: e[0][0], total: e[0][1] }
  }, [monthCompras])

  const sortedCompras = useMemo(() => {
    if (!sortCol) return monthCompras
    const dir = sortDir === 'asc' ? 1 : -1
    return [...monthCompras].sort((a, b) => {
      if (sortCol === 'proveedor') return dir * (a.proveedor || '').localeCompare(b.proveedor || '')
      if (sortCol === 'monto') return dir * ((Number(a.monto) || 0) - (Number(b.monto) || 0))
      if (sortCol === 'fecha') return dir * ((a.fecha || '').localeCompare(b.fecha || ''))
      return 0
    })
  }, [monthCompras, sortCol, sortDir])
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  useEffect(() => { if (drawerOpen) setTimeout(() => inputRef.current?.focus(), 250) }, [drawerOpen])

  const openDrawer = () => {
    setDraft({ ...EMPTY }); setShowNota(false); setSavedCount(0); setEditingId(null); setDrawerOpen(true)
  }
  const editCompra = (c) => {
    setDraft({
      proveedor: c.proveedor || '', concepto: c.concepto || '',
      cantidad: c.cantidad ? String(c.cantidad) : '',
      monto: c.monto ? fmtLive(String(c.monto)) : '',
      fecha: c.fecha || todayISO(),
      recurrente: !!c.recurrente, nota: c.nota || '',
    })
    setShowNota(!!c.nota); setSavedCount(0); setEditingId(c.id); setDrawerOpen(true)
  }
  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null) }

  const saveEntry = (keepOpen) => {
    const proveedor = draft.proveedor.trim()
    const concepto = draft.concepto.trim()
    const monto = parseFmtValue(draft.monto)
    if (!proveedor) { toast('Completa el proveedor', 'er'); return }
    if (monto <= 0) { toast('Completa el monto', 'er'); return }

    const cantidad = Number(draft.cantidad) || 0
    const payload = {
      id: editingId || undefined,
      proveedor, concepto, cantidad, monto,
      fecha: draft.fecha || todayISO(),
      recurrente: !!draft.recurrente,
      nota: draft.nota.trim(),
    }
    saveEntity('compras', payload)
    setSavedCount(c => c + 1)

    const dm = (draft.fecha || '').slice(0, 7)
    const offMonth = dm && dm !== mk
    const draftY = offMonth ? Number(dm.slice(0, 4)) : null
    const draftM = offMonth ? Number(dm.slice(5, 7)) - 1 : null
    const offLabel = offMonth ? `${MESES[draftM]} ${draftY}` : ''

    if (keepOpen && !editingId) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1200)
      if (offMonth) toast(`Cargado en ${offLabel}`, 'ok')
      // Mantenemos proveedor y fecha para carga en lote (ej: varias facturas del mismo día)
      // pero limpiamos concepto/cantidad/monto (son distintos por gasto)
      setDraft({ ...EMPTY, fecha: draft.fecha, proveedor: draft.proveedor })
      setShowNota(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      if (offMonth) {
        setYear(draftY); setMonth(draftM)
        toast(`Cargado en ${offLabel}`, 'ok')
      } else {
        toast(editingId ? 'Gasto actualizado' : 'Gasto registrado', 'ok')
      }
      closeDrawer()
    }
  }

  const removeCompra = (id) => {
    if (!confirm('¿Eliminar este gasto?')) return
    deleteEntity('compras', id)
    toast('Gasto eliminado', 'in')
  }

  // Copiar recurrentes del mes anterior
  const copiarRecurrentes = () => {
    const pm = month === 0 ? 11 : month - 1
    const py = month === 0 ? year - 1 : year
    const pmk = monthKey(py, pm)
    const recurrentes = allCompras.filter(c => compraMonth(c) === pmk && c.recurrente)
    if (recurrentes.length === 0) {
      toast('No hay gastos recurrentes en el mes anterior', 'in')
      return
    }
    // Evitar duplicados: si ya existe un gasto con mismo proveedor+concepto este mes, no lo copia
    const yaCargados = new Set(monthCompras.map(c => `${c.proveedor}|${c.concepto}`))
    let creados = 0
    recurrentes.forEach(c => {
      const key = `${c.proveedor}|${c.concepto}`
      if (yaCargados.has(key)) return
      saveEntity('compras', {
        proveedor: c.proveedor, concepto: c.concepto, monto: Number(c.monto) || 0,
        fecha: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        recurrente: true, nota: c.nota || '',
      })
      creados++
    })
    if (creados > 0) toast(`${creados} gasto${creados === 1 ? '' : 's'} recurrente${creados === 1 ? '' : 's'} cargado${creados === 1 ? '' : 's'}`, 'ok')
    else toast('Los recurrentes ya estaban cargados este mes', 'in')
  }

  const [showProvSug, setShowProvSug] = useState(false)
  const proveedorSuggestions = useMemo(() => {
    const q = (draft.proveedor || '').toLowerCase().trim()
    if (q.length < 1) return []
    // Prioridad: 1) suppliers del directorio; 2) proveedores usados antes en compras
    const dirMatches = suppliers.filter(s => (s.name || s.company || '').toLowerCase().includes(q))
    const historicos = [...new Set(allCompras.map(c => c.proveedor).filter(Boolean))]
      .filter(n => n.toLowerCase().includes(q) && !dirMatches.some(s => (s.name || s.company) === n))
      .map(n => ({ id: `hist_${n}`, name: n, __historic: true }))
    return [...dirMatches, ...historicos].slice(0, 6)
  }, [draft.proveedor, suppliers, allCompras])

  const Delta = ({ value }) => {
    if (value === null || value === undefined) return null
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
        color: value >= 0 ? '#DC2626' : '#15803d',
        background: value >= 0 ? 'rgba(220,38,38,.1)' : 'rgba(34,197,94,.1)',
      }} title={value >= 0 ? 'Gastaste más que el mes anterior' : 'Gastaste menos que el mes anterior'}>
        <i className={`fa fa-arrow-${value >= 0 ? 'up' : 'down'}`} style={{ fontSize: 7 }} />
        {Math.abs(value)}%
      </span>
    )
  }

  return (
    <div className="compras-page" style={{ padding: '10px 20px 80px', maxWidth: 1000, margin: '0 auto' }}>
      <style>{`
        .cp-row{display:grid;grid-template-columns:.7fr 1fr 1.2fr .7fr .35fr;gap:0;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;transition:background .1s}
        .cp-row:hover{background:var(--surface2)}
        .cp-hdr{font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;padding:8px 14px;background:var(--surface2);border-radius:10px 10px 0 0}
        .cp-hdr:hover{background:var(--surface2)}
        .cp-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cp-cell-r{text-align:right;font-variant-numeric:tabular-nums}
        .cp-nav-btn{background:none;border:1px solid var(--border);cursor:pointer;color:var(--txt2);font-size:13px;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;transition:background .15s;font-family:inherit;-webkit-tap-highlight-color:transparent;padding:0;flex-shrink:0}
        .cp-nav-btn:active{background:var(--surface2);transform:scale(.94)}
        .cp-icon-btn{width:26px;height:26px;border-radius:6px;border:none;background:transparent;color:var(--txt4);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;transition:all .12s;-webkit-tap-highlight-color:transparent;font-family:inherit;padding:0}
        .cp-icon-btn:hover{background:var(--surface2);color:var(--txt2)}
        .cp-recur{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:1px 6px;border-radius:5px;background:rgba(124,58,237,.1);color:var(--brand);vertical-align:middle;margin-left:6px}
        .cp-card-m{display:none}
        .cp-card-item{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;-webkit-tap-highlight-color:transparent;border-left:3px solid transparent;min-height:54px}
        .cp-card-info{flex:1;min-width:0}
        .cp-card-name{font-size:13.5px;font-weight:700;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3}
        .cp-card-sub{font-size:11px;color:var(--txt3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4}
        .cp-card-right{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
        .cp-card-amt{font-size:15px;font-weight:800;color:var(--txt);font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1}
        .cp-hero{margin-bottom:12px}
        .cp-hero-main{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .cp-hero-stats{flex:1 0 100%;border-top:1px solid var(--border);margin-top:4px;padding-top:12px;display:flex;gap:0}
        .cp-hero-stat{flex:1;display:flex;align-items:center;gap:10px}
        .cp-hero-stat-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
        .cp-hero-stat-val{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--txt);letter-spacing:-.02em}
        .cp-hero-stat-lbl{font-size:9px;font-weight:700;color:var(--txt4);text-transform:uppercase;letter-spacing:.06em}
        .cp-hero-divider{width:1px;background:var(--border);margin:0 4px;align-self:stretch}
        .cp-copy-recurrent{background:none;border:1px dashed var(--border);color:var(--txt3);cursor:pointer;font-size:11px;padding:6px 12px;border-radius:8px;font-family:inherit;font-weight:600;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
        .cp-copy-recurrent:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-xlt)}
        @media(max-width:900px){
          .cp-row,.cp-hdr{grid-template-columns:.6fr 1fr 1fr .3fr;font-size:12px}
          .cp-hide-m{display:none}
        }
        @media(max-width:600px){
          .compras-page{padding:8px 0 90px!important}
          .cp-header{padding:0 14px!important}
          .cp-hero{padding:0 14px!important}
          .cp-hero-main{padding:14px;gap:12px}
          .cp-hero-main .cp-new-btn{width:100%!important;flex:1 0 100%;order:10;justify-content:center}
          .cp-hero-stat-icon{width:26px;height:26px;font-size:11px}
          .cp-hero-stat-val{font-size:14px}
          .cp-month-nav{margin-left:14px!important;margin-right:14px!important;padding:6px 10px!important;margin-bottom:10px!important;border-radius:10px!important}
          .cp-month-label{font-size:13px!important}
          .cp-table-wrap{border-radius:0!important;border-left:none!important;border-right:none!important}
          .cp-row:not(.cp-total){display:none!important}
          .cp-hdr{display:none!important}
          .cp-card-m{display:block!important}
          .cp-total{display:none!important}
          .cp-mob-total{display:flex!important;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface2);border-radius:0 0 12px 12px}
          .cp-mob-total-hidden{display:none}
        }
      `}</style>

      {/* NAV MESES */}
      <div className="cp-month-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '8px 14px', marginBottom: 10 }}>
        <button className="cp-nav-btn" onClick={prevMonth}><i className="fa fa-chevron-left" /></button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div className="cp-month-label" style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px' }}>{MESES[month]} {year}</div>
          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {totals.count} {totals.count === 1 ? 'gasto' : 'gastos'}
            {deltaCount !== null && <Delta value={deltaCount} />}
          </div>
        </div>
        <button className="cp-nav-btn" onClick={nextMonth}><i className="fa fa-chevron-right" /></button>
      </div>

      {/* HERO */}
      <div className="cp-hero">
        <div className="cp-hero-main">
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, rgba(180,83,9,.12), rgba(180,83,9,.04))', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            <i className="fa fa-cart-shopping" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              Gastado del mes
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em', lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {hidden ? '***' : fmt(totals.gastado)}
              {deltaGasto !== null && <Delta value={deltaGasto} />}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>
              {totals.count > 0 ? `${totals.count} ${totals.count === 1 ? 'gasto registrado' : 'gastos registrados'}` : 'Sin gastos registrados'}
            </div>
          </div>
          <button className="cp-new-btn" onClick={openDrawer} style={{
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: 'var(--grad)', color: '#fff', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(124,58,237,.25)', flexShrink: 0,
          }}>
            <i className="fa fa-plus" style={{ fontSize: 10 }} /> Nuevo gasto
          </button>
          {topProveedor && (
            <div className="cp-hero-stats">
              <div className="cp-hero-stat">
                <div className="cp-hero-stat-icon" style={{ background: 'rgba(180,83,9,.1)', color: '#b45309' }}>
                  <i className="fa fa-crown" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cp-hero-stat-lbl">Mayor gasto</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topProveedor.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 600, flexShrink: 0 }}>{hidden ? '' : fmt(topProveedor.total)}</span>
                  </div>
                </div>
              </div>
              <div className="cp-hero-divider" />
              <div className="cp-hero-stat" style={{ justifyContent: 'flex-end' }}>
                <button className="cp-copy-recurrent" onClick={copiarRecurrentes} title="Copia los gastos marcados como recurrentes del mes anterior">
                  <i className="fa fa-rotate" style={{ fontSize: 10 }} />
                  Copiar recurrentes del mes anterior
                </button>
              </div>
            </div>
          )}
          {!topProveedor && (
            <div className="cp-hero-stats" style={{ justifyContent: 'center' }}>
              <button className="cp-copy-recurrent" onClick={copiarRecurrentes} title="Copia los gastos marcados como recurrentes del mes anterior">
                <i className="fa fa-rotate" style={{ fontSize: 10 }} />
                Copiar recurrentes del mes anterior
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="cp-table-wrap" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginTop: 14 }}>
        <div className="cp-row cp-hdr">
          <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('fecha')}>Fecha {sortCol === 'fecha' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
          <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('proveedor')}>Proveedor {sortCol === 'proveedor' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
          <span className="cp-hide-m">Concepto</span>
          <span className="cp-cell-r" style={{ cursor: 'pointer' }} onClick={() => toggleSort('monto')}>Monto {sortCol === 'monto' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
          <span />
        </div>

        {monthCompras.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,rgba(180,83,9,.1),rgba(180,83,9,.04))', color: '#b45309', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>
              <i className="fa fa-cart-shopping" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 4, letterSpacing: '-.2px' }}>
              {MESES[month]} arranca sin gastos
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.5, maxWidth: 300, margin: '0 auto 16px' }}>
              Registra lo que gastas con tus proveedores este mes.
              Cargá el primer gasto o copia los recurrentes del mes anterior.
            </div>
            <button onClick={openDrawer} style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: 'var(--grad)', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 7,
              boxShadow: '0 4px 12px rgba(124,58,237,.25)',
            }}>
              <i className="fa fa-plus" /> Cargar primer gasto
            </button>
          </div>
        )}

        {sortedCompras.map(c => {
          const [y, m, d] = (c.fecha || '').split('-')
          const fechaCorta = c.fecha ? `${Number(d)}/${Number(m)}` : ''
          return (
            <div key={c.id} className="cp-row" style={{ cursor: 'pointer' }} onClick={() => editCompra(c)}>
              <span className="cp-cell" style={{ color: 'var(--txt3)', fontSize: 12 }}>{fechaCorta}</span>
              <span className="cp-cell" style={{ fontWeight: 600, color: 'var(--txt)' }}>
                {c.proveedor || '---'}
                {c.recurrente && <span className="cp-recur"><i className="fa fa-rotate" style={{ fontSize: 8 }} />recurrente</span>}
              </span>
              <span className="cp-cell cp-hide-m" style={{ color: 'var(--txt2)' }}>
                {c.concepto || '---'}
                {c.cantidad > 0 && <span style={{ marginLeft: 6, color: 'var(--txt4)', fontSize: 11, fontWeight: 600 }}>· {c.cantidad}u</span>}
              </span>
              <span className="cp-cell cp-cell-r" style={{ fontWeight: 700, color: 'var(--txt)' }}>{hidden ? '***' : fmt(c.monto || 0)}</span>
              <span style={{ textAlign: 'center' }}>
                <button className="cp-icon-btn" title="Eliminar" onClick={e => { e.stopPropagation(); removeCompra(c.id) }}>
                  <i className="fa fa-xmark" />
                </button>
              </span>
            </div>
          )
        })}

        {/* Cards mobile */}
        <div className="cp-card-m">
          {sortedCompras.map(c => {
            const [y, m, d] = (c.fecha || '').split('-')
            const fechaCorta = c.fecha ? `${Number(d)}/${Number(m)}` : ''
            const sub = [fechaCorta, c.concepto, c.cantidad > 0 ? `${c.cantidad}u` : ''].filter(Boolean).join(' · ')
            return (
              <div key={c.id} className="cp-card-item" style={{ borderLeftColor: c.recurrente ? 'var(--brand)' : 'transparent' }} onClick={() => editCompra(c)}>
                <div className="cp-card-info">
                  <div className="cp-card-name">
                    {c.proveedor || '---'}
                    {c.recurrente && <span className="cp-recur"><i className="fa fa-rotate" style={{ fontSize: 8 }} />rec</span>}
                  </div>
                  <div className="cp-card-sub">{sub || '---'}</div>
                </div>
                <div className="cp-card-right">
                  <div className="cp-card-amt">{hidden ? '***' : fmt(c.monto || 0)}</div>
                  <button className="cp-icon-btn" title="Eliminar" onClick={e => { e.stopPropagation(); removeCompra(c.id) }}>
                    <i className="fa fa-xmark" style={{ fontSize: 10 }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Total desktop */}
        {monthCompras.length > 0 && (
          <div className="cp-row cp-total" style={{ background: 'var(--surface2)', fontWeight: 800, borderBottom: 'none', borderRadius: '0 0 12px 12px' }}>
            <span style={{ color: 'var(--txt3)', fontSize: 11, textTransform: 'uppercase' }}>Total</span>
            <span className="cp-hide-m" /><span className="cp-hide-m" />
            <span className="cp-cell-r" style={{ color: 'var(--txt)', fontSize: 15 }}>{hidden ? '***' : fmt(totals.gastado)}</span>
            <span />
          </div>
        )}
        {/* Total mobile */}
        {monthCompras.length > 0 && (
          <div className="cp-mob-total cp-mob-total-hidden" style={{ display: 'none' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{hidden ? '***' : fmt(totals.gastado)}</span>
          </div>
        )}
      </div>

      {/* DRAWER */}
      <CompraDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        draft={draft} setDraft={setDraft}
        inputRef={inputRef}
        proveedorSuggestions={proveedorSuggestions}
        showProvSug={showProvSug} setShowProvSug={setShowProvSug}
        showNota={showNota} setShowNota={setShowNota}
        saveEntry={saveEntry}
        savedCount={savedCount}
        justSaved={justSaved}
        isEdit={!!editingId}
        visibleMk={mk}
        meses={MESES}
      />
    </div>
  )
}

function CompraDrawer({ open, onClose, draft, setDraft, inputRef, proveedorSuggestions, showProvSug, setShowProvSug, showNota, setShowNota, saveEntry, savedCount, justSaved, isEdit, visibleMk, meses }) {
  if (!open) return null

  const handleMontoChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '')
    setDraft(d => ({ ...d, monto: raw ? fmtLive(raw) : '' }))
  }

  const draftMk = (draft.fecha || '').slice(0, 7)
  const offMonth = draftMk && visibleMk && draftMk !== visibleMk
  const offLabel = offMonth ? `${meses[Number(draftMk.slice(5, 7)) - 1]} ${draftMk.slice(0, 4)}` : ''

  return createPortal(
    <>
      <style>{`
        .cd-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);animation:cd-fade-in .2s ease}
        @keyframes cd-fade-in{from{opacity:0}to{opacity:1}}
        .cd-panel{position:fixed;top:0;right:0;bottom:0;z-index:9999;width:400px;max-width:100vw;background:var(--surface);border-left:1.5px solid var(--border);display:flex;flex-direction:column;animation:cd-slide-in .25s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 40px rgba(0,0,0,.2)}
        @keyframes cd-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
        .cd-header{padding:16px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .cd-body{flex:1;overflow-y:auto;padding:20px 22px 24px}
        .cd-footer{padding:12px 20px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;flex-shrink:0;background:var(--surface);transition:background .3s}
        .cd-footer-flash{background:rgba(5,150,105,.08)}
        .cd-group{margin-bottom:22px}
        .cd-fg{margin-bottom:14px}
        .cd-lbl{font-size:11px;font-weight:600;color:var(--txt3);margin-bottom:5px;display:block}
        .cd-inp{width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;color:var(--txt);background:var(--bg);outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}
        .cd-inp:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(124,58,237,.1)}
        .cd-inp::placeholder{color:var(--txt4)}
        .cd-inp-icon{position:relative}
        .cd-inp-icon i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--txt4);font-size:12px;pointer-events:none}
        .cd-inp-icon .cd-inp{padding-left:36px}
        .cd-sug{position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.2);max-height:200px;overflow-y:auto;margin-top:4px}
        .cd-sug-item{padding:9px 12px;cursor:pointer;font-size:13px;color:var(--txt2);transition:background .1s;display:flex;align-items:center;justify-content:space-between;gap:8px}
        .cd-sug-item:hover{background:var(--surface2)}
        .cd-sug-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:var(--surface2);color:var(--txt4);text-transform:uppercase}
        .cd-row{display:flex;gap:10px}
        .cd-row>*{flex:1;min-width:0}
        .cd-sep{height:1px;background:var(--border);margin:0 0 22px}
        .cd-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg);transition:border-color .15s}
        .cd-toggle:hover{border-color:var(--txt3)}
        .cd-switch{width:36px;height:20px;border-radius:99px;position:relative;transition:background .2s;flex-shrink:0}
        .cd-switch::after{content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
        .cd-switch-on{background:var(--brand)}
        .cd-switch-on::after{transform:translateX(16px)}
        .cd-switch-off{background:var(--border)}
        .cd-btn{padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:filter .15s,transform .1s}
        .cd-btn:active{transform:scale(.97)}
        .cd-btn-pri{border:none;background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(124,58,237,.25);width:100%}
        .cd-btn-pri:hover{filter:brightness(1.05)}
        .cd-btn-sec{border:1.5px solid var(--border);background:var(--surface);color:var(--txt2);width:100%}
        .cd-btn-sec:hover{border-color:var(--txt3)}
        .cd-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(124,58,237,.1);color:var(--brand)}
        .cd-nota-link{font-size:11px;color:var(--txt4);cursor:pointer;border:none;background:none;font-family:inherit;padding:0;transition:color .15s;display:inline-flex;align-items:center;gap:4px}
        .cd-nota-link:hover{color:var(--txt2)}
        .cd-saved-flash{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.2);color:#059669;font-size:12px;font-weight:700;animation:cd-pop .3s cubic-bezier(.17,.67,.25,1.3)}
        @keyframes cd-pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes cd-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @media(max-width:640px){
          .cd-panel{top:auto;left:0;right:0;bottom:0;width:100vw;max-height:92vh;border-left:none;border-radius:20px 20px 0 0;animation:cd-sheet-up .28s cubic-bezier(.4,0,.2,1)}
          .cd-panel::before{content:'';display:block;width:36px;height:4px;border-radius:4px;background:var(--border);margin:10px auto 0;flex-shrink:0}
          .cd-header{padding:6px 16px 8px}
          .cd-body{padding:6px 16px 16px}
          .cd-footer{padding:10px 16px max(12px,env(safe-area-inset-bottom))}
          .cd-group{margin-bottom:16px}
          .cd-fg{margin-bottom:10px}
          .cd-inp{min-height:42px}
          .cd-btn{min-height:44px}
        }
      `}</style>

      <div className="cd-overlay" onClick={onClose} />
      <div className="cd-panel">
        <div className="cd-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px' }}>
              {isEdit ? 'Editar gasto' : 'Nuevo gasto'}
            </div>
            {savedCount > 0 && !isEdit && (
              <div className="cd-badge">
                <i className="fa fa-check" style={{ fontSize: 9 }} /> {savedCount}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', fontSize: 16, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
            <i className="fa fa-xmark" />
          </button>
        </div>

        <div className="cd-body">
          {/* Proveedor */}
          <div className="cd-group">
            <label className="cd-lbl">Proveedor</label>
            <div className="cd-inp-icon" style={{ position: 'relative' }}>
              <i className="fa fa-industry" />
              <input ref={inputRef} className="cd-inp" placeholder="Buscar o escribir nombre..."
                value={draft.proveedor}
                onChange={e => { setDraft(d => ({ ...d, proveedor: e.target.value })); setShowProvSug(true) }}
                onFocus={() => draft.proveedor.length >= 1 && setShowProvSug(true)}
                onBlur={() => setTimeout(() => setShowProvSug(false), 150)}
              />
              {showProvSug && proveedorSuggestions.length > 0 && (
                <div className="cd-sug">
                  {proveedorSuggestions.map(p => (
                    <div key={p.id} className="cd-sug-item"
                      onMouseDown={() => { setDraft(d => ({ ...d, proveedor: p.name || p.company })); setShowProvSug(false) }}>
                      <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{p.name || p.company}</span>
                      {p.__historic && <span className="cd-sug-badge">usado antes</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="cd-sep" />

          {/* Concepto + cantidad + monto */}
          <div className="cd-group">
            <div className="cd-fg">
              <label className="cd-lbl">Concepto</label>
              <input className="cd-inp" placeholder="Ej: serigrafia septiembre, buzos varios..."
                value={draft.concepto}
                onChange={e => setDraft(d => ({ ...d, concepto: e.target.value }))}
              />
            </div>
            <div className="cd-row" style={{ marginBottom: 0 }}>
              <div className="cd-fg" style={{ flex: '.55', marginBottom: 0 }}>
                <label className="cd-lbl">Cantidad</label>
                <input className="cd-inp" type="number" min="0" placeholder="0"
                  value={draft.cantidad}
                  onChange={e => setDraft(d => ({ ...d, cantidad: e.target.value }))}
                  style={{ textAlign: 'center', fontWeight: 700 }}
                />
              </div>
              <div className="cd-fg" style={{ flex: 1, marginBottom: 0 }}>
                <label className="cd-lbl">Monto total</label>
                <input className="cd-inp" placeholder="$0"
                  value={draft.monto ? `$${draft.monto}` : ''}
                  onChange={handleMontoChange}
                  style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}
                />
              </div>
            </div>
            {(() => {
              const qty = Number(draft.cantidad) || 0
              const total = parseFmtValue(draft.monto)
              if (qty > 0 && total > 0) {
                const pu = Math.round(total / qty)
                return (
                  <div style={{
                    marginTop: 6, padding: '5px 10px', borderRadius: 7,
                    background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.12)',
                    fontSize: 11, color: 'var(--txt2)', fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <i className="fa fa-calculator" style={{ color: 'var(--brand)', fontSize: 10 }} />
                    <span>{qty} × <b style={{ color: 'var(--brand)' }}>{fmt(pu)}/u</b></span>
                  </div>
                )
              }
              return null
            })()}
          </div>

          <div className="cd-sep" />

          {/* Fecha + Recurrente */}
          <div className="cd-group">
            <div className="cd-row">
              <div className="cd-fg" style={{ marginBottom: 0 }}>
                <label className="cd-lbl">Fecha</label>
                <input className="cd-inp" type="date" value={draft.fecha}
                  onChange={e => setDraft(d => ({ ...d, fecha: e.target.value }))}
                  style={offMonth ? { borderColor: '#7C3AED' } : {}}
                />
                {offMonth && (
                  <div style={{ marginTop: 5, fontSize: 10.5, fontWeight: 600, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.3 }}>
                    <i className="fa fa-arrow-turn-up" style={{ transform: 'rotate(90deg)', fontSize: 9 }} />
                    Se guarda en {offLabel}
                  </div>
                )}
              </div>
              <div className="cd-fg" style={{ marginBottom: 0 }}>
                <label className="cd-lbl">Recurrente</label>
                <div className="cd-toggle" onClick={() => setDraft(d => ({ ...d, recurrente: !d.recurrente }))} title="Marcalo si se repite todos los meses. Podes copiarlo al mes siguiente desde el hero.">
                  <div className={`cd-switch ${draft.recurrente ? 'cd-switch-on' : 'cd-switch-off'}`} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)' }}>{draft.recurrente ? 'Sí' : 'No'}</div>
                    {draft.recurrente && <div style={{ fontSize: 10, color: 'var(--brand)', marginTop: 1 }}>se repite cada mes</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="cd-sep" />

          {/* Nota */}
          <div className="cd-group" style={{ marginBottom: 0 }}>
            {!showNota ? (
              <button className="cd-nota-link" onClick={() => setShowNota(true)}>
                <i className="fa fa-plus" style={{ fontSize: 9 }} /> Nota interna
              </button>
            ) : (
              <div className="cd-fg" style={{ marginBottom: 0 }}>
                <label className="cd-lbl">Nota</label>
                <input className="cd-inp" placeholder="Ej: factura pendiente, pago en efectivo..."
                  value={draft.nota}
                  onChange={e => setDraft(d => ({ ...d, nota: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>

        <div className={`cd-footer ${justSaved ? 'cd-footer-flash' : ''}`}>
          {justSaved && (
            <div className="cd-saved-flash">
              <i className="fa fa-circle-check" /> Guardado — carga otro
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isEdit && (
              <button className="cd-btn cd-btn-sec" onClick={() => saveEntry(true)} style={{ flex: 1 }}>
                <i className="fa fa-rotate" style={{ fontSize: 11 }} /> Otro más
              </button>
            )}
            <button className="cd-btn cd-btn-pri" onClick={() => saveEntry(false)} style={{ flex: 1 }}>
              <i className="fa fa-check" /> {isEdit ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
