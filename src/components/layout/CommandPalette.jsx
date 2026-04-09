import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { fmt, STATUS_MAP } from '../../lib/storage'

export default function CommandPalette({ onClose }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef()
  const nav = useNavigate()
  const { get } = useData()

  useEffect(() => { inputRef.current?.focus() }, [])

  const pages = [
    { type: 'nav', icon: 'fa-clock-rotate-left', label: 'Historial', sub: 'Dashboard y análisis', path: '/' },
    { type: 'nav', icon: 'fa-file-invoice-dollar', label: 'Nuevo presupuesto', sub: 'Crear presupuesto', path: '/presupuesto' },
    { type: 'nav', icon: 'fa-users', label: 'Clientes', sub: 'Base de contactos', path: '/clientes' },
    { type: 'nav', icon: 'fa-box-open', label: 'Catálogo', sub: 'Productos y categorías', path: '/catalogo' },
    { type: 'nav', icon: 'fa-industry', label: 'Proveedores', sub: 'Directorio', path: '/proveedores' },
    { type: 'nav', icon: 'fa-truck-fast', label: 'Logística', sub: 'Envíos ViaCargo', path: '/logistica' },
    { type: 'nav', icon: 'fa-comment-dots', label: 'Mensajes WA', sub: 'Templates', path: '/mensajes' },
    { type: 'nav', icon: 'fa-gear', label: 'Configuración', sub: 'Ajustes del sistema', path: '/config' },
  ]

  const clients = get('clients').map(c => ({
    type: 'cli', icon: 'fa-building', label: c.company || c.contact || '—',
    sub: `${c.contact || ''} ${c.wa ? '· ' + c.wa : ''} ${c.rubro ? '· ' + c.rubro : ''}`.trim(),
    path: '/clientes',
    data: c,
  }))

  const prods = get('products').map(p => ({
    type: 'prod', icon: 'fa-cube', label: p.name || '—',
    sub: `${p.cat || 'Sin categoría'} · Costo: ${fmt(p.cost)}`,
    path: '/catalogo',
  }))

  const budgets = get('budgets').map(b => ({
    type: 'bud', icon: 'fa-file-invoice', label: `${b.num || '—'} — ${b.company || b.contact || 'Sin cliente'}`,
    sub: `${STATUS_MAP[b.status] || 'Borrador'} · ${b.date || '—'} · ${fmt(b.total)}`,
    path: `/presupuesto/${b.id}`,
  }))

  const all = [...pages, ...clients, ...prods, ...budgets]
  const lq = q.toLowerCase()
  const results = q
    ? all.filter(i => i.label.toLowerCase().includes(lq) || (i.sub || '').toLowerCase().includes(lq)).slice(0, 12)
    : pages

  const go = (item) => { nav(item.path); onClose() }

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[sel]) go(results[sel])
  }

  const iconCls = (type) => {
    if (type === 'cli') return 'cli'
    if (type === 'bud') return 'bud'
    if (type === 'prod') return 'prod'
    return 'nav'
  }

  return (
    <div className="cmd-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cmd-box">
        <div className="cmd-input-wrap">
          <i className="fa fa-magnifying-glass" style={{ color: 'var(--txt3)' }} />
          <input ref={inputRef} className="cmd-input" placeholder="Buscar clientes, productos, presupuestos..."
            value={q} onChange={e => { setQ(e.target.value); setSel(0) }} onKeyDown={handleKey} autoComplete="off" />
          <span className="cmd-kbd">ESC</span>
        </div>
        <div className="cmd-results">
          {results.length ? results.map((r, i) => (
            <div key={i} className={`cmd-item ${i === sel ? 'sel' : ''}`} onClick={() => go(r)} onMouseEnter={() => setSel(i)}>
              <div className={`cmd-ico ${iconCls(r.type)}`}><i className={`fa ${r.icon}`} /></div>
              <div className="cmd-txt"><div className="main">{r.label}</div><div className="sub">{r.sub}</div></div>
              {r.type !== 'nav' && <span style={{ fontSize: 9, color: 'var(--txt4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>
                {r.type === 'cli' ? 'Cliente' : r.type === 'prod' ? 'Producto' : 'Presup.'}
              </span>}
            </div>
          )) : <div className="cmd-empty">Sin resultados para "{q}"</div>}
        </div>
        <div className="cmd-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> seleccionar</span>
          <span><kbd>Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  )
}
