import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

export default function Logistica() {
  const { get, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const [tab, setTab] = useState('envios')
  const [sFilter, setSFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [tzForm, setTzForm] = useState({ zone: '', ppkg: '', min: '', days: '', notes: '' })
  const [calcZone, setCalcZone] = useState('')
  const [calcKg, setCalcKg] = useState('')

  const shipments = get('shipments')
  const budgets = get('budgets')
  const tariffs = get('tariffs')
  const statusList = ['Preparando', 'Despachado', 'En tránsito', 'Entregado', 'Con problema']

  let filteredShips = shipments
  if (sFilter !== 'all') filteredShips = filteredShips.filter(s => s.status === sFilter)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openShip = (s) => {
    setForm(s || { remito: '', date: new Date().toISOString().slice(0, 10), status: 'Preparando', budgetId: '', client: '', city: '', addr: '', bulks: 1, weight: '', service: 'Estándar', freight: 0, payer: 'Mi negocio', notes: '' })
    setModal(true)
  }
  const saveShip = () => {
    if (!form.remito && !form.client) { toast('Completá remito o cliente.', 'er'); return }
    saveEntity('shipments', form); setModal(false); toast('Envío guardado', 'ok')
  }
  const delShip = (id) => { if (window.confirm('¿Eliminar envío?')) { deleteEntity('shipments', id); toast('Envío eliminado', 'in') } }

  const addTariff = () => {
    if (!tzForm.zone) { toast('Ingresá la zona.', 'er'); return }
    saveEntity('tariffs', { ...tzForm, ppkg: Number(tzForm.ppkg), min: Number(tzForm.min), days: Number(tzForm.days) })
    setTzForm({ zone: '', ppkg: '', min: '', days: '', notes: '' }); toast('Tarifa agregada', 'ok')
  }
  const delTariff = (id) => { deleteEntity('tariffs', id); toast('Tarifa eliminada', 'in') }

  const calcFrete = () => {
    const t = tariffs.find(x => x.zone === calcZone)
    if (!t || !calcKg) return '— Ingresá los datos para calcular'
    return fmt(Math.max(t.min || 0, (t.ppkg || 0) * Number(calcKg)))
  }

  const totalShipCost = shipments.reduce((s, x) => s + (x.freight || 0), 0)
  const thisMonth = shipments.filter(s => s.date?.startsWith(new Date().toISOString().slice(0, 7))).length
  const avgCost = shipments.length ? Math.round(totalShipCost / shipments.length) : 0

  const statusBadge = (s) => {
    const cls = { Preparando: 'b-amber', Despachado: 'b-blue', 'En tránsito': 'b-purple', Entregado: 'b-confirmed', 'Con problema': 'b-lost' }
    return <span className={`badge ${cls[s] || 'b-draft'}`}>{s}</span>
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>Logística</h2><p>Gestión de envíos ViaCargo — costos, remitos y seguimiento</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => openShip()}><i className="fa fa-plus" /> Registrar envío</button>
      </div>
      <div className="tab-bar">
        {['envios', 'tarifas', 'resumen'].map(t => (
          <div key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'envios' ? 'Envíos registrados' : t === 'tarifas' ? 'Tarifas ViaCargo' : 'Resumen de costos'}
          </div>
        ))}
      </div>

      {tab === 'envios' && (
        <>
          <div className="pill-row">
            <div className={`pill ${sFilter === 'all' ? 'active' : ''}`} onClick={() => setSFilter('all')}>Todos</div>
            {statusList.map(s => <div key={s} className={`pill ${sFilter === s ? 'active' : ''}`} onClick={() => setSFilter(s)}>{s}</div>)}
          </div>
          <div className="tbl-card">
            <table>
              <thead><tr><th>Remito</th><th>Fecha</th><th>Cliente</th><th>Presupuesto</th><th>Servicio</th><th>Bultos</th><th>Peso</th><th>Costo</th><th>Paga</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {filteredShips.length ? filteredShips.map(s => {
                  const bud = budgets.find(b => b.id === s.budgetId)
                  return (
                    <tr key={s.id}>
                      <td><b>{s.remito || '—'}</b></td><td>{s.date}</td><td>{s.client}</td>
                      <td>{bud?.num || '—'}</td><td>{s.service}</td><td>{s.bulks}</td><td>{s.weight} kg</td>
                      <td style={{ fontWeight: 700 }}>{fmt(s.freight)}</td><td>{s.payer}</td>
                      <td>{statusBadge(s.status)}</td>
                      <td><div className="acts">
                        <button className="act edit" onClick={() => openShip(s)} title="Editar"><i className="fa fa-pen" /></button>
                        <button className="act del" onClick={() => delShip(s.id)} title="Eliminar"><i className="fa fa-trash" /></button>
                      </div></td>
                    </tr>
                  )
                }) : <tr><td colSpan={11}><div className="empty"><div className="ico"><i className="fa fa-truck-fast" /></div><p>Sin envíos registrados</p></div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'tarifas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Agregar tarifa / zona</span></div>
              <div className="grid2">
                <div className="fg"><label>Zona / Destino</label><input type="text" value={tzForm.zone} onChange={e => setTzForm(f => ({ ...f, zone: e.target.value }))} placeholder="Córdoba Capital" /></div>
                <div className="fg"><label>Precio por kg ($)</label><input type="number" value={tzForm.ppkg} onChange={e => setTzForm(f => ({ ...f, ppkg: e.target.value }))} /></div>
                <div className="fg"><label>Mínimo ($)</label><input type="number" value={tzForm.min} onChange={e => setTzForm(f => ({ ...f, min: e.target.value }))} /></div>
                <div className="fg"><label>Días hábiles</label><input type="number" value={tzForm.days} onChange={e => setTzForm(f => ({ ...f, days: e.target.value }))} /></div>
              </div>
              <div className="fg"><label>Notas</label><input type="text" value={tzForm.notes} onChange={e => setTzForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <button className="btn btn-primary btn-sm" onClick={addTariff}><i className="fa fa-plus" /> Agregar tarifa</button>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Tarifas configuradas</span></div>
              {tariffs.length ? tariffs.map(t => (
                <div key={t.id} className="metric-row">
                  <span className="mr-label"><b>{t.zone}</b> — {fmt(t.ppkg)}/kg · mín {fmt(t.min)} · {t.days}d</span>
                  <button className="act del" onClick={() => delTariff(t.id)} style={{ flexShrink: 0 }}><i className="fa fa-trash" /></button>
                </div>
              )) : <div style={{ fontSize: 13, color: 'var(--txt3)', padding: 12 }}>Sin tarifas</div>}
            </div>
          </div>
          <div className="frete-calc">
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><i className="fa fa-calculator" style={{ color: 'var(--brand)' }} />Calculadora de flete</h4>
            <div className="grid2">
              <div className="fg"><label>Zona destino</label>
                <select value={calcZone} onChange={e => setCalcZone(e.target.value)}>
                  <option value="">Seleccioná zona</option>
                  {tariffs.map(t => <option key={t.id} value={t.zone}>{t.zone}</option>)}
                </select>
              </div>
              <div className="fg"><label>Peso total (kg)</label><input type="number" value={calcKg} onChange={e => setCalcKg(e.target.value)} placeholder="1" /></div>
            </div>
            <div className="frete-result">{calcFrete()}</div>
          </div>
        </>
      )}

      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
          <div className="card card-sm"><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Costo total envíos</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--money)' }}>{fmt(totalShipCost)}</div></div>
          <div className="card card-sm"><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Envíos este mes</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--money)' }}>{thisMonth}</div></div>
          <div className="card card-sm"><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Promedio por envío</div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--money)' }}>{fmt(avgCost)}</div></div>
        </div>
      )}

      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal modal-lg">
            <div className="mh"><h3>Registrar envío ViaCargo</h3><button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button></div>
            <div className="grid2">
              <div className="fg"><label>N° Remito</label><input type="text" value={form.remito || ''} onChange={e => setF('remito', e.target.value)} placeholder="VC-001234" /></div>
              <div className="fg"><label>Fecha</label><input type="date" value={form.date || ''} onChange={e => setF('date', e.target.value)} /></div>
              <div className="fg"><label>Estado</label><select value={form.status || 'Preparando'} onChange={e => setF('status', e.target.value)}>{statusList.map(s => <option key={s}>{s}</option>)}</select></div>
              <div className="fg"><label>Presupuesto</label><select value={form.budgetId || ''} onChange={e => setF('budgetId', Number(e.target.value))}><option value="">Sin asociar</option>{budgets.map(b => <option key={b.id} value={b.id}>{b.num} — {b.company || b.contact}</option>)}</select></div>
            </div>
            <div className="grid2">
              <div className="fg"><label>Cliente</label><input type="text" value={form.client || ''} onChange={e => setF('client', e.target.value)} /></div>
              <div className="fg"><label>Ciudad destino</label><input type="text" value={form.city || ''} onChange={e => setF('city', e.target.value)} /></div>
            </div>
            <div className="grid3">
              <div className="fg"><label>Bultos</label><input type="number" value={form.bulks || 1} onChange={e => setF('bulks', Number(e.target.value))} min="1" /></div>
              <div className="fg"><label>Peso (kg)</label><input type="number" value={form.weight || ''} onChange={e => setF('weight', e.target.value)} /></div>
              <div className="fg"><label>Servicio</label><select value={form.service || 'Estándar'} onChange={e => setF('service', e.target.value)}><option>Estándar</option><option>Urgente / Express</option><option>Puerta a puerta</option><option>Entrega en sucursal</option></select></div>
            </div>
            <div className="grid2">
              <div className="fg"><label>Costo flete ($)</label><input type="number" value={form.freight || 0} onChange={e => setF('freight', Number(e.target.value))} /></div>
              <div className="fg"><label>¿Quién paga?</label><select value={form.payer || 'Mi negocio'} onChange={e => setF('payer', e.target.value)}><option>Mi negocio</option><option>El cliente</option><option>Incluido en precio</option></select></div>
            </div>
            <div className="fg"><label>Notas</label><textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} rows={2} /></div>
            <div className="mfooter"><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={saveShip}><i className="fa fa-floppy-disk" /> Guardar envío</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
