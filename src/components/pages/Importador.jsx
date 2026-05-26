import { useState, useRef, useEffect } from 'react'
import { useData }         from '../../context/DataContext'
import { parseText, markDuplicates } from '../../lib/importParser'

// ── Constantes de entidades para ANMA Regalos ────────────────────────
const ENTIDADES = [
  {
    key:     'clients',
    tipo:    'clientes',
    label:   'Clientes',
    icon:    'fa-building',
    color:   '#7C3AED',
    bg:      '#EDE9FE',
    nameKey: 'company',
    headers: 'Empresa, Contacto, WhatsApp, Email, Rubro, Notas',
    ejemplo: 'Banco del Sur SA, Laura Ibáñez, 1155667788, laura@bancosur.com, Financiero, Pedido anual regalos ejecutivos',
  },
  {
    key:     'suppliers',
    tipo:    'proveedores',
    label:   'Proveedores',
    icon:    'fa-industry',
    color:   '#0891B2',
    bg:      '#CFFAFE',
    nameKey: 'name',
    headers: 'Nombre, Contacto, WhatsApp, Rubro, Email, Notas',
    ejemplo: 'Imprenta Creativa, Pablo Torres, 1177889900, Impresión, ptorres@icreativa.com',
  },
  {
    key:     'products',
    tipo:    'productos',
    label:   'Catálogo de Regalos',
    icon:    'fa-gift',
    color:   '#DB2777',
    bg:      '#FCE7F3',
    nameKey: 'name',
    headers: 'Nombre, Categoría, Costo, Precio, Proveedor',
    ejemplo: 'Kit Wellness Premium, Kits, 2400, 3800, Proveedor Natura',
  },
]

// ── Helpers de UI ─────────────────────────────────────────────────────

function KpiChip({ count, label, color, bg, icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 20,
      background: count > 0 ? bg : 'var(--surface2)',
      border: `1px solid ${count > 0 ? color + '40' : 'var(--border)'}`,
    }}>
      <i className={`fa ${icon}`} style={{ fontSize: 10, color: count > 0 ? color : 'var(--txt4)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: count > 0 ? color : 'var(--txt4)' }}>{count}</span>
      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{label}</span>
    </div>
  )
}

function StatusDot({ status }) {
  const MAP = {
    valid:     { color: '#059669', icon: 'fa-plus-circle',    title: 'Nuevo' },
    duplicate: { color: '#2563EB', icon: 'fa-rotate',         title: 'Actualiza' },
    empty:     { color: '#94A3B8', icon: 'fa-minus-circle',   title: 'Vacío' },
  }
  const s = MAP[status] || MAP.empty
  return <i className={`fa ${s.icon}`} style={{ color: s.color, fontSize: 12 }} title={s.title} />
}

function FilaPreview({ fila, nameKey }) {
  const name  = fila[nameKey] || fila.name || fila.company || '(vacío)'
  const extra = [fila.contact, fila.wa, fila.email, fila.cat].filter(Boolean).slice(0, 2).join(' · ')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px', borderRadius: 6,
      background: fila._status === 'empty' ? 'var(--surface2)' : 'var(--surface)',
      border: '1px solid var(--border)', marginBottom: 2,
      opacity: fila._status === 'empty' ? 0.5 : 1,
    }}>
      <StatusDot status={fila._status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        {extra && <div style={{ fontSize: 10, color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extra}</div>}
      </div>
    </div>
  )
}

// ── Sección de importación para una entidad ───────────────────────────

function SeccionEntidad({ ent, existingList, onChange }) {
  const [texto, setTexto]     = useState('')
  const [open, setOpen]       = useState(false)
  const [showAll, setShowAll] = useState(false)
  const fileRef = useRef()

  const filas = texto.trim()
    ? markDuplicates(parseText(texto, ent.tipo).filas, existingList, ent.nameKey)
    : []

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => { onChangeRef.current(filas) }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps

  const validas  = filas.filter(f => f._status === 'valid').length
  const dupls    = filas.filter(f => f._status === 'duplicate').length
  const omitidas = filas.filter(f => f._status === 'empty').length
  const total    = filas.length

  const handlePaste  = (e) => { setTexto(e.clipboardData?.getData('text') || ''); e.preventDefault() }
  const handleChange = (e) => setTexto(e.target.value)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setTexto(ev.target.result || ''); e.target.value = '' }
    reader.readAsText(file, 'UTF-8')
  }

  const currentFilas = filas

  return (
    <div style={{
      border: `1.5px solid ${total > 0 ? ent.color + '50' : 'var(--border)'}`,
      borderRadius: 12, overflow: 'hidden',
      background: 'var(--surface)',
      transition: 'border-color .2s',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', background: total > 0 ? ent.bg : 'var(--surface2)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          transition: 'background .15s',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: total > 0 ? ent.color : 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: 'background .15s',
        }}>
          <i className={`fa ${ent.icon}`} style={{ color: '#fff', fontSize: 13 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{ent.label}</div>
          {total > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
              {validas  > 0 && <KpiChip count={validas}  label="nuevos"    color="#059669" bg="#D1FAE5" icon="fa-plus-circle" />}
              {dupls    > 0 && <KpiChip count={dupls}    label="actualiza" color="#2563EB" bg="#DBEAFE" icon="fa-rotate" />}
              {omitidas > 0 && <KpiChip count={omitidas} label="omitidos"  color="#94A3B8" bg="var(--surface2)" icon="fa-minus-circle" />}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--txt4)', marginTop: 1 }}>Sin datos — pegá o subí un archivo</div>
          )}
        </div>
        <i className={`fa fa-chevron-${open ? 'up' : 'down'}`} style={{ color: 'var(--txt4)', fontSize: 11, flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            fontSize: 10, color: 'var(--txt3)', marginBottom: 8, padding: '6px 8px',
            background: 'var(--surface2)', borderRadius: 6, fontFamily: 'monospace',
            lineHeight: 1.6,
          }}>
            <span style={{ fontFamily: 'inherit', fontWeight: 700, color: 'var(--txt2)' }}>Columnas: </span>
            {ent.headers}
            <br />
            <span style={{ color: 'var(--txt4)' }}>Ej: {ent.ejemplo}</span>
          </div>

          <textarea
            value={texto}
            onChange={handleChange}
            onPaste={handlePaste}
            placeholder={`Pegá aquí tus datos (CSV o Excel copiado)…\n\n${ent.ejemplo}`}
            rows={texto ? 4 : 5}
            style={{
              width: '100%', resize: 'vertical', padding: '8px 10px',
              border: '1.5px solid var(--border)', borderRadius: 8,
              fontSize: 12, fontFamily: 'monospace', color: 'var(--txt)',
              background: 'var(--surface)', outline: 'none', boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
            onFocus={e => e.target.style.borderColor = ent.color}
            onBlur={e  => e.target.style.borderColor = 'var(--border)'}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface2)', fontSize: 11, cursor: 'pointer', color: 'var(--txt2)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <i className="fa fa-file-csv" style={{ fontSize: 11 }} />
              Subir .csv
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" style={{ display: 'none' }} onChange={handleFile} />
            {texto && (
              <button
                onClick={() => { setTexto(''); setShowAll(false) }}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'none', fontSize: 11, cursor: 'pointer', color: 'var(--txt4)',
                }}
              >
                <i className="fa fa-xmark" style={{ marginRight: 4 }} />Limpiar
              </button>
            )}
          </div>

          {currentFilas.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--txt4)',
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5,
              }}>
                Vista previa — {total} {total === 1 ? 'fila' : 'filas'} detectadas
              </div>
              {(showAll ? currentFilas : currentFilas.slice(0, 5)).map((f, i) => (
                <FilaPreview key={i} fila={f} nameKey={ent.nameKey} />
              ))}
              {currentFilas.length > 5 && (
                <button
                  onClick={() => setShowAll(s => !s)}
                  style={{
                    marginTop: 4, fontSize: 11, color: ent.color, background: 'none',
                    border: 'none', cursor: 'pointer', fontWeight: 600, padding: '2px 0',
                  }}
                >
                  {showAll ? '▲ Mostrar menos' : `▼ Ver ${currentFilas.length - 5} más`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────

export default function Importador() {
  const { get, importarEntidades } = useData()

  const [parsed, setParsed] = useState({
    clients:  [],
    suppliers: [],
    products: [],
  })

  const [loading, setLoading]     = useState(false)
  const [resultado, setResultado] = useState(null)

  const existing = {
    clients:   get('clients',   []),
    suppliers: get('suppliers', []),
    products:  get('products',  []),
  }

  const totalNuevos = Object.values(parsed).flat().filter(f => f._status === 'valid').length
  const totalDupls  = Object.values(parsed).flat().filter(f => f._status === 'duplicate').length
  const totalFilas  = Object.values(parsed).flat().length
  const hayDatos    = totalFilas > 0

  const handleSectionChange = (key, filas) => {
    setParsed(prev => ({ ...prev, [key]: filas }))
  }

  const handleConfirm = async () => {
    if (!hayDatos) return
    setLoading(true)
    setResultado(null)

    try {
      const resumen = {}

      // ── Paso 1: Proveedores primero ──
      if (parsed.suppliers.some(f => f._status !== 'empty')) {
        const res = importarEntidades('suppliers', parsed.suppliers)
        resumen.suppliers = res
      }

      const supplierList = get('suppliers', [])

      // ── Paso 2: Clientes ──
      if (parsed.clients.some(f => f._status !== 'empty')) {
        const res = importarEntidades('clients', parsed.clients)
        resumen.clients = res
      }

      // ── Paso 3: Productos (con resolución de proveedor) ──
      if (parsed.products.some(f => f._status !== 'empty')) {
        const res = importarEntidades('products', parsed.products, { supplierList })
        resumen.products = res
      }

      setResultado(resumen)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 20px 100px', maxWidth: 720, margin: '0 auto' }}>

      {/* Hero */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #DB2777, #7C3AED)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fa fa-file-import" style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--txt)' }}>Importador de Datos</h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--txt3)' }}>Pegá CSV o Excel — los duplicados se actualizan automáticamente</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {['1 · Expandí la sección', '2 · Pegá tus datos', '3 · Revisá la vista previa', '4 · Confirmá la migración'].map((s, i) => (
            <span key={i} style={{
              fontSize: 10.5, fontWeight: 600, color: 'var(--txt3)',
              background: 'var(--surface2)', padding: '3px 8px', borderRadius: 20,
              border: '1px solid var(--border)',
            }}>{s}</span>
          ))}
        </div>
      </div>

      {/* Secciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ENTIDADES.map(ent => (
          <SeccionEntidad
            key={ent.key}
            ent={ent}
            existingList={existing[ent.key]}
            onChange={(filas) => handleSectionChange(ent.key, filas)}
          />
        ))}
      </div>

      {/* Barra sticky de confirmación */}
      <div style={{
        position: 'sticky', bottom: 0,
        marginTop: 20,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        borderRadius: '12px 12px 0 0',
        padding: '14px 16px',
        boxShadow: '0 -4px 20px rgba(0,0,0,.08)',
      }}>
        {hayDatos && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <KpiChip count={totalNuevos} label="nuevos"       color="#059669" bg="#D1FAE5" icon="fa-plus-circle" />
            <KpiChip count={totalDupls}  label="a actualizar" color="#2563EB" bg="#DBEAFE" icon="fa-rotate" />
            <span style={{ fontSize: 11, color: 'var(--txt4)', alignSelf: 'center' }}>
              {totalFilas} filas en {Object.values(parsed).filter(a => a.length > 0).length} categorías
            </span>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!hayDatos || loading}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 10,
            background: hayDatos && !loading ? 'linear-gradient(135deg, #DB2777, #7C3AED)' : 'var(--surface3)',
            color: hayDatos && !loading ? '#fff' : 'var(--txt4)',
            border: 'none', fontSize: 14, fontWeight: 800, cursor: hayDatos ? 'pointer' : 'default',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all .15s',
          }}
        >
          {loading ? (
            <>
              <span style={{
                width: 14, height: 14, border: '2px solid #fff4', borderTopColor: '#fff',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block',
              }} />
              Importando…
            </>
          ) : (
            <>
              <i className="fa fa-cloud-arrow-up" />
              {hayDatos ? `Confirmar Migración — ${totalNuevos + totalDupls} registros` : 'Pegá datos para continuar'}
            </>
          )}
        </button>
      </div>

      {/* Modal de resultado */}
      {resultado && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
          onClick={() => setResultado(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,.25)',
              padding: 24, width: '100%', maxWidth: 400,
              animation: 'pgIn .18s ease both',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="fa fa-check-circle" style={{ color: '#059669', fontSize: 18 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>¡Migración completada!</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Los datos ya están en tu app</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {Object.entries(resultado).map(([key, res]) => {
                const ent = ENTIDADES.find(e => e.key === key)
                if (!ent) return null
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                  }}>
                    <i className={`fa ${ent.icon}`} style={{ color: ent.color, fontSize: 14, width: 18, textAlign: 'center' }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{ent.label}</span>
                    <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>{res.nuevos} nuevos</span>
                    {res.actualizados > 0 && <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 700 }}>{res.actualizados} actualiz.</span>}
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => setResultado(null)}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                background: 'linear-gradient(135deg, #DB2777, #7C3AED)', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
