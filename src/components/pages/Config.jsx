import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { testMPConnection } from '../../lib/mercadopago'
import { applyThemeColors } from '../../lib/theme'

function ListEditor({ label, items, onAdd, onRemove }) {
  const [val, setVal] = useState('')
  const add = () => { if (val.trim()) { onAdd(val.trim()); setVal('') } }
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 14 }}>{label}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span>{item}</span>
          <button className="act del" onClick={() => onRemove(i)} style={{ flexShrink: 0 }}><i className="fa fa-xmark" /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input type="text" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          style={{ flex: 1, padding: '8px 11px', border: '2px solid var(--border)', borderRadius: 9, fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
          placeholder={`Nueva ${label.toLowerCase().replace(/s$/, '')}...`} />
        <button className="btn btn-primary btn-xs" onClick={add}><i className="fa fa-plus" /></button>
      </div>
    </div>
  )
}

export default function Config() {
  const { get, config, updateConfig } = useData()
  const { logout, changePassword } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('identidad')
  const c = config()

  const [bname, setBname] = useState(c.businessName || '')
  const [bsub, setBsub] = useState(c.subtitle || '')
  const [bcolor, setBcolor] = useState(c.brandColor || '#7C3AED')
  const [acolor, setAcolor] = useState(c.accentColor || '#059669')
  const [cEmail, setCEmail] = useState(c.contactEmail || '')
  const [cWA, setCWA] = useState(c.contactWA || '')
  const [cIG, setCIG] = useState(c.contactIG || '')
  const [cWeb, setCWeb] = useState(c.contactWeb || '')
  const [cAddr, setCAddr] = useState(c.address || '')
  const [currency, setCurrency] = useState(c.currency || '$')
  const [prefix, setPrefix] = useState(c.budgetPrefix || 'AN')
  const [defMargin, setDefMargin] = useState(c.defaultMargin || 40)
  const [defDeposit, setDefDeposit] = useState(c.defaultDeposit || 50)
  const [validity, setValidity] = useState(c.validity || 15)
  const [conds, setConds] = useState(c.paymentConditions || '')
  const [legal, setLegal] = useState(c.legalNote || '')
  const [mpToken, setMpToken] = useState(c.mpToken || '')
  const [mpPubkey, setMpPubkey] = useState(c.mpPubkey || '')
  const [mpName, setMpName] = useState(c.mpName || '')
  const [mpCurrency, setMpCurrency] = useState(c.mpCurrency || 'ARS')
  const [mpSena, setMpSena] = useState(c.mpUseSena || false)
  const [mpTestResult, setMpTestResult] = useState('')
  const [newPass, setNewPass] = useState('')
  const [repPass, setRepPass] = useState('')
  const [acctEmail, setAcctEmail] = useState(c.email || '')

  /* ── Marca blanca: cambio en tiempo real ── */
  const handlePrincipalChange = (hex) => {
    setBcolor(hex)
    applyThemeColors(hex, acolor)
  }
  const handleAcentoChange = (hex) => {
    setAcolor(hex)
    applyThemeColors(bcolor, hex)
  }
  const resetColors = () => {
    const defP = '#7C3AED', defA = '#059669'
    setBcolor(defP); setAcolor(defA)
    applyThemeColors(defP, defA)
  }

  const saveAll = () => {
    updateConfig({
      businessName: bname, subtitle: bsub, brandColor: bcolor, accentColor: acolor,
      contactEmail: cEmail, contactWA: cWA, contactIG: cIG, contactWeb: cWeb, address: cAddr,
      currency, budgetPrefix: prefix, defaultMargin: Number(defMargin), defaultDeposit: Number(defDeposit), validity: Number(validity),
      paymentConditions: conds, legalNote: legal,
    })
    applyThemeColors(bcolor, acolor)
    toast('Configuración guardada', 'ok')
  }

  const saveMPConfig = () => {
    updateConfig({ mpToken, mpPubkey, mpName, mpCurrency, mpUseSena: mpSena })
    toast('Configuración MP guardada', 'ok')
  }

  const testMP = async () => {
    if (!mpToken) { toast('Ingresá un Access Token.', 'er'); return }
    setMpTestResult('<span style="color:var(--amber)"><i class="fa fa-spinner fa-spin"></i> Probando...</span>')
    const r = await testMPConnection(mpToken)
    if (r.ok) setMpTestResult(`<span style="color:var(--green)"><i class="fa fa-circle-check"></i> Conexión exitosa — ${r.count} métodos disponibles</span>`)
    else setMpTestResult(`<span style="color:var(--red)"><i class="fa fa-circle-xmark"></i> Error: ${r.message}</span>`)
  }

  const handleChangePass = async () => {
    if (!newPass || newPass.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.', 'er'); return }
    if (newPass !== repPass) { toast('Las contraseñas no coinciden.', 'er'); return }
    await changePassword(newPass)
    if (acctEmail !== c.email) updateConfig({ email: acctEmail })
    setNewPass(''); setRepPass('')
    toast('Contraseña actualizada', 'ok')
  }

  const handleLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300 * 1024) { toast('La imagen debe ser menor a 300KB.', 'er'); return }
    const reader = new FileReader()
    reader.onload = (ev) => { updateConfig({ logo: ev.target.result }); toast('Logo actualizado', 'ok') }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => { updateConfig({ logo: '' }); toast('Logo eliminado', 'in') }

  const clearAll = () => {
    if (window.confirm('¿Estás seguro? Se eliminarán TODOS los datos.')) {
      ['budgets', 'clients', 'products', 'suppliers', 'tariffs', 'shipments', 'waTemplates'].forEach(k => localStorage.removeItem('anma3_' + k))
      toast('Datos eliminados', 'in'); window.location.reload()
    }
  }

  const doBackup = () => {
    const data = { budgets: get('budgets'), clients: get('clients'), products: get('products'), suppliers: get('suppliers'), tariffs: get('tariffs'), shipments: get('shipments'), waTemplates: get('waTemplates'), cfg: config() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ANMA_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }

  const handleListAdd = (configKey, val) => updateConfig({ [configKey]: [...(c[configKey] || []), val] })
  const handleListRemove = (configKey, idx) => updateConfig({ [configKey]: (c[configKey] || []).filter((_, i) => i !== idx) })

  const userName = (c.email || '').split('@')[0] || 'Administrador'

  const tabs = [
    { id: 'identidad', icon: 'fa-building', label: 'Identidad' },
    { id: 'contacto', icon: 'fa-phone', label: 'Contacto' },
    { id: 'comercial', icon: 'fa-dollar-sign', label: 'Comercial' },
    { id: 'listas', icon: 'fa-list', label: 'Listas' },
    { id: 'pagos', icon: 'fa-credit-card', label: 'Pagos' },
    { id: 'cuenta', icon: 'fa-shield-halved', label: 'Cuenta' },
  ]

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>Configuración</h2><p>Personalizá la app para tu negocio</p></div>
        <button className="btn btn-primary btn-sm" onClick={saveAll}><i className="fa fa-floppy-disk" /> Guardar cambios</button>
      </div>

      <div className="cfg-tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <i className={`fa ${t.icon}`} style={{ marginRight: 6 }} />{t.label}
          </div>
        ))}
      </div>

      {tab === 'identidad' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'start' }}>
            <div>
              <div className="fl" style={{ marginBottom: 8 }}>Logo</div>
              <div className="logo-zone" onClick={() => document.getElementById('logo-file').click()}>
                {c.logo ? <img src={c.logo} alt="" /> : <><i className="fa fa-camera" style={{ fontSize: 22 }} /><span>Subir logo</span></>}
              </div>
              <input type="file" id="logo-file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
              <button className="btn btn-ghost btn-xs" style={{ marginTop: 8, width: '100%' }} onClick={removeLogo}>Quitar</button>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textAlign: 'center', marginTop: 4 }}>PNG/JPG · máx 300KB</div>
            </div>
            <div>
              <div className="fg"><label>Nombre del negocio</label><input type="text" value={bname} onChange={e => setBname(e.target.value)} placeholder="ANMA" /></div>
              <div className="fg"><label>Subtítulo</label><input type="text" value={bsub} onChange={e => setBsub(e.target.value)} placeholder="Tu negocio en un solo lugar" /></div>
              {/* ── Selector de Marca Blanca ── */}
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '16px 18px', marginTop: 8, border: '1.5px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 12 }}>Colores de marca</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {/* Color Principal */}
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt2)', marginBottom: 6, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                      <i className="fa fa-palette" style={{ marginRight: 5, color: bcolor }} />Color Principal
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={bcolor} onChange={e => handlePrincipalChange(e.target.value)}
                        style={{ width: 44, height: 36, border: '2px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--surface)' }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: bcolor, fontFamily: 'monospace' }}>{bcolor.toUpperCase()}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)' }}>Sidebar, botones, badges</div>
                      </div>
                    </div>
                  </div>
                  {/* Color Acento */}
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt2)', marginBottom: 6, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                      <i className="fa fa-droplet" style={{ marginRight: 5, color: acolor }} />Color Acento
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={acolor} onChange={e => handleAcentoChange(e.target.value)}
                        style={{ width: 44, height: 36, border: '2px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--surface)' }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: acolor, fontFamily: 'monospace' }}>{acolor.toUpperCase()}</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)' }}>Detalles, ganancias, estados</div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Vista previa */}
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: bcolor, flexShrink: 0 }} />
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: acolor, flexShrink: 0 }} />
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${bcolor}, ${acolor})`, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>Vista previa en vivo</span>
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={resetColors} title="Restaurar colores originales">
                    <i className="fa fa-rotate-left" /> Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'contacto' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="grid2">
            <div className="fg"><label>Email</label><input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="hola@anma.com" /></div>
            <div className="fg"><label>WhatsApp</label><input type="text" value={cWA} onChange={e => setCWA(e.target.value)} placeholder="+54 351 ..." /></div>
            <div className="fg"><label>Instagram</label><input type="text" value={cIG} onChange={e => setCIG(e.target.value)} placeholder="@anma_regalos" /></div>
            <div className="fg"><label>Sitio web</label><input type="text" value={cWeb} onChange={e => setCWeb(e.target.value)} placeholder="https://..." /></div>
          </div>
          <div className="fg"><label>Dirección</label><input type="text" value={cAddr} onChange={e => setCAddr(e.target.value)} placeholder="Av. Corrientes 1234, CABA" /></div>
        </div>
      )}

      {tab === 'comercial' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="grid2">
            <div className="fg"><label>Moneda</label><input type="text" value={currency} onChange={e => setCurrency(e.target.value)} style={{ maxWidth: 80 }} /></div>
            <div className="fg"><label>Prefijo numeración</label><input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} style={{ maxWidth: 100 }} /></div>
            <div className="fg"><label>Margen por defecto (%)</label><input type="number" value={defMargin} onChange={e => setDefMargin(e.target.value)} /></div>
            <div className="fg"><label>Seña por defecto (%)</label><input type="number" value={defDeposit} onChange={e => setDefDeposit(e.target.value)} /></div>
            <div className="fg"><label>Validez (días)</label><input type="number" value={validity} onChange={e => setValidity(e.target.value)} /></div>
          </div>
          <div className="fg"><label>Condiciones de pago</label><textarea value={conds} onChange={e => setConds(e.target.value)} rows={3} /></div>
          <div className="fg"><label>Nota legal</label><textarea value={legal} onChange={e => setLegal(e.target.value)} rows={2} /></div>
        </div>
      )}

      {tab === 'listas' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <ListEditor label="Modalidades de entrega" items={c.deliveryModes || []} onAdd={v => handleListAdd('deliveryModes', v)} onRemove={i => handleListRemove('deliveryModes', i)} />
          <ListEditor label="Categorías de productos" items={c.productCats || []} onAdd={v => handleListAdd('productCats', v)} onRemove={i => handleListRemove('productCats', i)} />
          <ListEditor label="Ocasiones habituales" items={c.occasions || []} onAdd={v => handleListAdd('occasions', v)} onRemove={i => handleListRemove('occasions', i)} />
        </div>
      )}

      {tab === 'pagos' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#009EE3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa fa-credit-card" style={{ color: '#fff', fontSize: 20 }} /></div>
            <div><div style={{ fontWeight: 800, fontSize: 16, color: 'var(--txt)' }}>Mercado Pago — Checkout Pro</div><div style={{ fontSize: 12, color: 'var(--txt3)' }}>Generá links de cobro directo</div></div>
          </div>
          <div style={{ background: 'var(--blue-lt)', border: '1.5px solid #93C5FD', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <i className="fa fa-circle-info" style={{ marginTop: 2 }} />
            <div>Obtené tu Access Token desde <b>mercadopago.com.ar → Tu negocio → Configuración → Credenciales</b>. Usá las de <b>producción</b>.</div>
          </div>
          <div className="fg"><label>Access Token</label><input type="password" value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-xxxxxxxx..." style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
          <div className="fg"><label>Public Key</label><input type="text" value={mpPubkey} onChange={e => setMpPubkey(e.target.value)} placeholder="APP_USR-xxxxxxxx..." style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
          <div className="grid2">
            <div className="fg"><label>Nombre visible</label><input type="text" value={mpName} onChange={e => setMpName(e.target.value)} placeholder="Mi Negocio" /></div>
            <div className="fg"><label>Moneda</label><select value={mpCurrency} onChange={e => setMpCurrency(e.target.value)}><option value="ARS">ARS</option><option value="BRL">BRL</option><option value="CLP">CLP</option><option value="MXN">MXN</option><option value="USD">USD</option></select></div>
          </div>
          <div className="toggle-field">
            <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Incluir seña como monto</div><div style={{ fontSize: 11, color: 'var(--txt3)' }}>Si está activo, cobra solo el % de seña</div></div>
            <button className={`toggle ${mpSena ? 'on' : ''}`} onClick={() => setMpSena(!mpSena)} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={testMP}><i className="fa fa-flask-vial" /> Probar conexión</button>
            <button className="btn btn-secondary btn-sm" onClick={saveMPConfig}><i className="fa fa-floppy-disk" /> Guardar config MP</button>
          </div>
          {mpTestResult && <div style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: mpTestResult }} />}
        </div>
      )}

      {tab === 'cuenta' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 700 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff' }}>{(userName[0] || 'A').toUpperCase()}</div>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>{userName}</div><div style={{ fontSize: 12, color: 'var(--txt3)' }}>Usuario activo</div></div>
            </div>
            <div className="fg"><label>Email de cuenta</label><input type="email" value={acctEmail} onChange={e => setAcctEmail(e.target.value)} /></div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', letterSpacing: '.8px', textTransform: 'uppercase', margin: '8px 0 14px' }}>Cambiar contraseña</div>
            <div className="fg"><label>Nueva contraseña</label><input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
            <div className="fg"><label>Repetir</label><input type="password" value={repPass} onChange={e => setRepPass(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></div>
            <button className="btn btn-primary btn-sm" onClick={handleChangePass}><i className="fa fa-key" /> Actualizar contraseña</button>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Sistema</div>
            {[['Versión', 'ANMA v3.0'], ['Clientes', get('clients').length], ['Presupuestos', get('budgets').length], ['Productos', get('products').length], ['Proveedores', get('suppliers').length]].map(([l, v], i) => (
              <div key={i} className="metric-row"><span className="mr-label">{l}</span><span className="mr-val">{v}</span></div>
            ))}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={doBackup}><i className="fa fa-cloud-arrow-down" /> Exportar backup JSON</button>
              <button className="btn btn-danger btn-sm" onClick={clearAll}><i className="fa fa-trash" /> Limpiar todos los datos</button>
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" onClick={logout}><i className="fa fa-right-from-bracket" /> Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
