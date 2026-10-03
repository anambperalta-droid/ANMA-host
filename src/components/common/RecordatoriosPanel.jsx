// Panel colapsable de recordatorios accionables. Embed anywhere.
import { useState, useMemo } from 'react'
import { getRecordatorios, CAT_META } from '../../lib/recordatorios'
import { buildWAMsg } from '../../lib/waMsg'

export default function RecordatoriosPanel({ budgets, cfg, onSaveBudget, onOpenBudget, toast }) {
  const items = useMemo(() => getRecordatorios(budgets), [budgets])
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('rec_dismissed') || '[]')) } catch { return new Set() }
  })
  const visible = items.filter(x => !dismissed.has(x.b.id))
  if (!visible.length) return null

  const grouped = { cobro: [], sena: [], frio: [] }
  visible.forEach(x => grouped[x.cat].push(x))

  const sendWA = (b) => {
    const text = buildWAMsg(b, { cfg })
    const num = (b.wa || '').replace(/\D/g, '')
    const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    onSaveBudget?.({ ...b, lastContactAt: Date.now(), lastContactChannel: 'wa' })
    toast?.('Contacto registrado', 'ok')
  }
  const dismiss = (id) => {
    const next = new Set(dismissed); next.add(id); setDismissed(next)
    try { localStorage.setItem('rec_dismissed', JSON.stringify([...next])) } catch {}
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'linear-gradient(135deg,rgba(124,58,237,.08),rgba(124,58,237,.02))', border: 'none', borderBottom: open ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.01em' }}>
          <i className="fa fa-bell" style={{ color: 'var(--brand)' }} />
          Para hoy
          <span style={{ background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, marginLeft: 4 }}>{visible.length}</span>
        </span>
        <i className={`fa fa-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 11, color: 'var(--txt3)' }} />
      </button>
      {open && (
        <div style={{ padding: '8px 14px 12px' }}>
          {['cobro','sena','frio'].map(cat => {
            if (!grouped[cat].length) return null
            const m = CAT_META[cat]
            return (
              <div key={cat} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: m.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className={`fa ${m.icon}`} /> {m.label} <span style={{ color: 'var(--txt4)', fontWeight: 600 }}>· {grouped[cat].length}</span>
                </div>
                {grouped[cat].slice(0, 5).map(({ b, label, days }) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: m.bg, borderRadius: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.company || b.contact || '—'}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 1 }}>
                        {label} · {b.lastContactAt ? `${days}d sin contacto` : 'sin contacto previo'}
                      </div>
                    </div>
                    <button onClick={() => sendWA(b)} title="Enviar WhatsApp"
                      style={{ padding: '5px 10px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <i className="fa-brands fa-whatsapp" /> WA
                    </button>
                    {onOpenBudget && (
                      <button onClick={() => onOpenBudget(b)} title="Ver detalle"
                        style={{ width: 26, height: 26, background: 'rgba(255,255,255,.6)', color: 'var(--txt2)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                        <i className="fa fa-eye" />
                      </button>
                    )}
                    <button onClick={() => dismiss(b.id)} title="Omitir por ahora"
                      style={{ width: 26, height: 26, background: 'transparent', color: 'var(--txt4)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                      <i className="fa fa-xmark" />
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
