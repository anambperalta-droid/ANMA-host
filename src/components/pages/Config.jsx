import { useState, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { testMPConnection } from '../../lib/mercadopago'
import { applyThemeColors } from '../../lib/theme'
import { getSheetsConfig, setSheetsConfig, testSheetsConnection, pushAllBudgets, APPS_SCRIPT_TEMPLATE } from '../../lib/sheets'
import { SITES, CURRENT_SITE, sendInvite } from '../../lib/invites'

function ListEditor({ label, items, onAdd, onRemove }) {
  const [val, setVal] = useState('')
  const [dupErr, setDupErr] = useState(false)
  const add = () => {
    if (!val.trim()) return
    if (items.some(i => i.toLowerCase() === val.trim().toLowerCase())) {
      setDupErr(true)
      setTimeout(() => setDupErr(false), 2500)
      return
    }
    onAdd(val.trim()); setVal('')
  }
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
        <input type="text" value={val}
          onChange={e => { setVal(e.target.value); setDupErr(false) }}
          onKeyDown={e => e.key === 'Enter' && add()}
          style={{ flex: 1, padding: '8px 11px', border: `2px solid ${dupErr ? '#FCA5A5' : 'var(--border)'}`, borderRadius: 9, fontFamily: 'inherit', fontSize: 13, outline: 'none', transition: 'border-color .2s' }}
          placeholder={`Nueva ${label.toLowerCase().replace(/s$/, '')}...`} />
        <button className="btn btn-primary btn-xs" onClick={add}><i className="fa fa-plus" /></button>
      </div>
      {dupErr && (
        <div style={{ color: '#DC2626', fontSize: 11, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="fa fa-triangle-exclamation" /> Ya existe en la lista
        </div>
      )}
    </div>
  )
}

export default function Config() {
  const { get, config, updateConfig } = useData()
  const { logout, changePassword, isGlobalAdmin } = useAuth()
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
  const [numberFormat, setNumberFormat] = useState(c.numberFormat || 'es-AR')
  const [prefix, setPrefix] = useState(c.budgetPrefix || 'AN')
  const [defMargin, setDefMargin] = useState(c.defaultMargin || 40)
  const [defDeposit, setDefDeposit] = useState(c.defaultDeposit || 50)
  const [validity, setValidity] = useState(c.validity || 15)
  const [conds, setConds] = useState(c.paymentConditions || '')
  const [legal, setLegal] = useState(c.legalNote || '')
  const [mpEnabled, setMpEnabled] = useState(c.mpEnabled !== false)
  const [mpToken, setMpToken] = useState(c.mpToken || '')
  const [mpPubkey, setMpPubkey] = useState(c.mpPubkey || '')
  const [mpName, setMpName] = useState(c.mpName || '')
  const [mpCurrency, setMpCurrency] = useState(c.mpCurrency || 'ARS')
  const [mpSena, setMpSena] = useState(c.mpUseSena || false)
  const [mpTestResult, setMpTestResult] = useState('')
  const [bankEnabled, setBankEnabled] = useState(c.bankEnabled === true)
  const [bankHolder, setBankHolder] = useState(c.bankHolder || '')
  const [bankName, setBankName] = useState(c.bankName || '')
  const [bankAccountType, setBankAccountType] = useState(c.bankAccountType || 'Cuenta corriente')
  const [bankCbu, setBankCbu] = useState(c.bankCbu || '')
  const [bankAlias, setBankAlias] = useState(c.bankAlias || '')
  const [bankCuit, setBankCuit] = useState(c.bankCuit || '')
  const [bankNotes, setBankNotes] = useState(c.bankNotes || '')
  const [newPass, setNewPass] = useState('')
  const [repPass, setRepPass] = useState('')
  const [acctEmail, setAcctEmail] = useState(c.email || '')

  /* ── Google Sheets sync state ── */
  const initSheets = getSheetsConfig()
  const [gsEnabled, setGsEnabled] = useState(initSheets.enabled)
  const [gsUrl, setGsUrl] = useState(initSheets.url)
  const [gsAuto, setGsAuto] = useState(initSheets.autoSync !== false)
  const [gsLastSync, setGsLastSync] = useState(initSheets.lastSync)
  const [gsLastStatus, setGsLastStatus] = useState(initSheets.lastStatus)
  const [gsTestResult, setGsTestResult] = useState('')
  const [gsShowScript, setGsShowScript] = useState(false)
  const [gsBulkLoading, setGsBulkLoading] = useState(false)

  /* ── Invitaciones / Equipo ── */
  const [invEmail, setInvEmail] = useState('')
  const [invName, setInvName] = useState('')
  const [invSite] = useState(CURRENT_SITE.key)
  const [invRole, setInvRole] = useState('user')
  const [invLoading, setInvLoading] = useState(false)
  const [invMsg, setInvMsg] = useState(null)

  const sendInviteHandler = async () => {
    setInvMsg(null)
    if (!invEmail.trim()) { setInvMsg({ type: 'er', text: 'Ingresá un email.' }); return }
    setInvLoading(true)
    try {
      await sendInvite({ email: invEmail, siteKey: invSite, fullName: invName, role: invRole })
      const site = SITES.find(s => s.key === invSite)
      setInvMsg({ type: 'ok', text: `Invitación enviada a ${invEmail} — destino: ${site.label}` })
      setInvEmail('')
      setInvName('')
      toast('Invitación enviada', 'ok')
    } catch (e) {
      setInvMsg({ type: 'er', text: e.message || 'Error al enviar la invitación' })
    } finally {
      setInvLoading(false)
    }
  }

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
      currency, numberFormat, budgetPrefix: prefix, defaultMargin: Number(defMargin), defaultDeposit: Number(defDeposit), validity: Number(validity),
      paymentConditions: conds, legalNote: legal,
    })
    applyThemeColors(bcolor, acolor)
    toast('Configuración guardada', 'ok')
  }

  const saveMPConfig = () => {
    updateConfig({ mpEnabled, mpToken, mpPubkey, mpName, mpCurrency, mpUseSena: mpSena })
    toast('Configuración MP guardada', 'ok')
  }

  const saveBankConfig = () => {
    updateConfig({ bankEnabled, bankHolder, bankName, bankAccountType, bankCbu, bankAlias, bankCuit, bankNotes })
    toast('Datos bancarios guardados', 'ok')
  }

  const saveSheetsConfig = () => {
    setSheetsConfig({ enabled: gsEnabled, url: gsUrl.trim(), autoSync: gsAuto })
    toast('Integración con Google Sheets guardada', 'ok')
  }
  const testSheets = async () => {
    setGsTestResult('<span style="color:var(--amber)"><i class="fa fa-spinner fa-spin"></i> Enviando ping...</span>')
    const r = await testSheetsConnection(gsUrl.trim())
    if (r.ok) {
      setGsTestResult(`<span style="color:var(--green)"><i class="fa fa-circle-check"></i> ${r.message}</span>`)
      setSheetsConfig({ enabled: gsEnabled, url: gsUrl.trim(), autoSync: gsAuto, lastSync: new Date().toISOString(), lastStatus: 'ok' })
      setGsLastSync(new Date().toISOString()); setGsLastStatus('ok')
    } else {
      setGsTestResult(`<span style="color:var(--red)"><i class="fa fa-circle-xmark"></i> ${r.message}</span>`)
    }
  }
  const syncAllBudgets = async () => {
    if (!gsEnabled || !gsUrl.trim()) { toast('Primero activá y configurá la URL de Google Sheets.', 'er'); return }
    setGsBulkLoading(true)
    const bud = get('budgets')
    const r = await pushAllBudgets(bud)
    setGsBulkLoading(false)
    if (r.ok) {
      toast(`${r.count} presupuestos enviados a Google Sheets`, 'ok')
      setGsLastSync(new Date().toISOString()); setGsLastStatus('ok')
    } else {
      toast(`Error: ${r.message}`, 'er')
      setGsLastStatus('error')
    }
  }
  const copyAppsScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE).then(() => toast('Código Apps Script copiado al portapapeles', 'ok'))
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

  // Solo "Equipo" (invitar usuarios) es exclusivo del admin global.
  // Pagos, Integraciones y Cuenta los puede ver y editar cualquier usuario autenticado.
  const ADMIN_ONLY_TABS = new Set(['equipo'])

  const allTabs = [
    { id: 'identidad', icon: 'fa-building', label: 'Identidad' },
    { id: 'contacto', icon: 'fa-phone', label: 'Contacto' },
    { id: 'comercial', icon: 'fa-dollar-sign', label: 'Comercial' },
    { id: 'listas', icon: 'fa-list', label: 'Listas' },
    { id: 'pagos', icon: 'fa-credit-card', label: 'Pagos' },
    { id: 'integraciones', icon: 'fa-plug', label: 'Integraciones' },
    { id: 'equipo', icon: 'fa-user-plus', label: 'Equipo' },
    { id: 'cuenta', icon: 'fa-shield-halved', label: 'Cuenta' },
  ]
  const tabs = isGlobalAdmin ? allTabs : allTabs.filter(t => !ADMIN_ONLY_TABS.has(t.id))

  // Si un no-admin está parado en una tab sensible (por URL vieja o state
  // residual), lo reubicamos en 'identidad' en el próximo render.
  useEffect(() => {
    if (!isGlobalAdmin && ADMIN_ONLY_TABS.has(tab)) setTab('identidad')
  }, [isGlobalAdmin, tab])

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
            <div className="fg"><label>Símbolo moneda</label><input type="text" value={currency} onChange={e => setCurrency(e.target.value)} style={{ maxWidth: 80 }} /></div>
            <div className="fg"><label>Formato de números</label>
              <select value={numberFormat} onChange={e => setNumberFormat(e.target.value)}>
                <option value="es-AR">1.234.567 (punto miles — AR/ES)</option>
                <option value="en-US">1,234,567 (coma miles — US/UK)</option>
              </select>
            </div>
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
        <div style={{ display: 'grid', gap: 18, maxWidth: 780 }}>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 2 }}>
            <i className="fa fa-circle-info" style={{ marginRight: 6, color: 'var(--brand)' }} />
            Activá los métodos que querés ofrecer a tus clientes. Pueden estar los dos al mismo tiempo.
          </div>

          {/* ── MERCADO PAGO CARD ── */}
          <div className={`pay-card ${mpEnabled ? 'on' : ''}`}>
            <div className="pay-card-head" onClick={() => setMpEnabled(!mpEnabled)}>
              <div className="pay-icon" style={{ background: 'linear-gradient(135deg,#009EE3,#00C1EA)' }}>
                <i className="fa fa-credit-card" />
              </div>
              <div className="pay-head-txt">
                <div className="pay-head-title">Mercado Pago</div>
                <div className="pay-head-sub">Checkout Pro — Link de cobro con tarjeta, QR o dinero en cuenta</div>
              </div>
              <div className={`pay-status ${mpEnabled ? 'on' : ''}`}>
                {mpEnabled ? <><i className="fa fa-circle-check" /> ACTIVO</> : <><i className="fa fa-circle" /> INACTIVO</>}
              </div>
              <button className={`toggle ${mpEnabled ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setMpEnabled(!mpEnabled) }} />
            </div>
            {mpEnabled && (
              <div className="pay-card-body">
                <div style={{ background: 'var(--blue-lt)', border: '1.5px solid #93C5FD', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--blue)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
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
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Cobrar solo la seña</div><div style={{ fontSize: 11, color: 'var(--txt3)' }}>Si está activo, el link cobra solo el % de seña configurada</div></div>
                  <button className={`toggle ${mpSena ? 'on' : ''}`} onClick={() => setMpSena(!mpSena)} />
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={testMP}><i className="fa fa-flask-vial" /> Probar conexión</button>
                  <button className="btn btn-primary btn-sm" onClick={saveMPConfig}><i className="fa fa-floppy-disk" /> Guardar Mercado Pago</button>
                </div>
                {mpTestResult && <div style={{ marginTop: 12, fontSize: 12 }} dangerouslySetInnerHTML={{ __html: mpTestResult }} />}
              </div>
            )}
          </div>

          {/* ── TRANSFERENCIA BANCARIA CARD ── */}
          <div className={`pay-card ${bankEnabled ? 'on' : ''}`}>
            <div className="pay-card-head" onClick={() => setBankEnabled(!bankEnabled)}>
              <div className="pay-icon" style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
                <i className="fa fa-building-columns" />
              </div>
              <div className="pay-head-txt">
                <div className="pay-head-title">Transferencia bancaria</div>
                <div className="pay-head-sub">CBU / Alias — Para clientes que no usan Mercado Pago</div>
              </div>
              <div className={`pay-status ${bankEnabled ? 'on' : ''}`}>
                {bankEnabled ? <><i className="fa fa-circle-check" /> ACTIVO</> : <><i className="fa fa-circle" /> INACTIVO</>}
              </div>
              <button className={`toggle ${bankEnabled ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setBankEnabled(!bankEnabled) }} />
            </div>
            {bankEnabled && (
              <div className="pay-card-body">
                <div style={{ background: 'rgba(16,185,129,.08)', border: '1.5px solid rgba(16,185,129,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--acento)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <i className="fa fa-circle-info" style={{ marginTop: 2 }} />
                  <div>Estos datos se mostrarán en el presupuesto enviado al cliente. Podés copiarlos desde el panel de "Cobrar" en cada presupuesto.</div>
                </div>
                <div className="grid2">
                  <div className="fg"><label>Titular</label><input type="text" value={bankHolder} onChange={e => setBankHolder(e.target.value)} placeholder="Juan Pérez / Empresa SA" /></div>
                  <div className="fg"><label>Banco</label><input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Galicia, Santander, BBVA..." /></div>
                  <div className="fg"><label>Tipo de cuenta</label>
                    <select value={bankAccountType} onChange={e => setBankAccountType(e.target.value)}>
                      <option>Cuenta corriente</option>
                      <option>Caja de ahorro</option>
                      <option>Cuenta única</option>
                    </select>
                  </div>
                  <div className="fg"><label>CUIT / CUIL</label><input type="text" value={bankCuit} onChange={e => setBankCuit(e.target.value)} placeholder="20-12345678-9" /></div>
                </div>
                <div className="fg">
                  <label><i className="fa fa-hashtag" style={{ marginRight: 4, color: 'var(--acento)' }} />CBU (22 dígitos)</label>
                  <input type="text" value={bankCbu} onChange={e => setBankCbu(e.target.value.replace(/\s/g, ''))} placeholder="0000000000000000000000" maxLength={22} style={{ fontFamily: 'monospace', letterSpacing: '.5px' }} />
                </div>
                <div className="fg">
                  <label><i className="fa fa-at" style={{ marginRight: 4, color: 'var(--acento)' }} />Alias</label>
                  <input type="text" value={bankAlias} onChange={e => setBankAlias(e.target.value)} placeholder="mi.negocio.arg" style={{ fontFamily: 'monospace' }} />
                </div>
                <div className="fg"><label>Notas adicionales (opcional)</label><textarea value={bankNotes} onChange={e => setBankNotes(e.target.value)} rows={2} placeholder="Ej: Enviar comprobante por WhatsApp al finalizar." /></div>
                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveBankConfig}><i className="fa fa-floppy-disk" /> Guardar datos bancarios</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'integraciones' && (
        <div style={{ display: 'grid', gap: 18, maxWidth: 820 }}>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 2 }}>
            <i className="fa fa-circle-info" style={{ marginRight: 6, color: 'var(--brand)' }} />
            Conectá ANMA con herramientas externas. Los datos se envían en tiempo real cuando guardás un presupuesto.
          </div>

          {/* ── GOOGLE SHEETS CARD ── */}
          <div className={`pay-card ${gsEnabled ? 'on' : ''}`}>
            <div className="pay-card-head" onClick={() => setGsEnabled(!gsEnabled)}>
              <div className="pay-icon" style={{ background: 'linear-gradient(135deg,#0F9D58,#34A853)' }}>
                <i className="fa fa-table" />
              </div>
              <div className="pay-head-txt">
                <div className="pay-head-title">Google Sheets <span style={{ fontSize: 9, padding: '2px 7px', background: 'var(--brand-xlt)', color: 'var(--brand)', borderRadius: 20, marginLeft: 6, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>Nuevo</span></div>
                <div className="pay-head-sub">Sincronización automática — espeja los presupuestos en una hoja de cálculo</div>
              </div>
              <div className={`pay-status ${gsEnabled ? 'on' : ''}`}>
                {gsEnabled ? <><i className="fa fa-circle-check" /> ACTIVO</> : <><i className="fa fa-circle" /> INACTIVO</>}
              </div>
              <button className={`toggle ${gsEnabled ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setGsEnabled(!gsEnabled) }} />
            </div>
            {gsEnabled && (
              <div className="pay-card-body">
                <div style={{ background: 'rgba(52,168,83,.08)', border: '1.5px solid rgba(52,168,83,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 11, color: '#0F9D58', lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="fa fa-list-ol" /> Pasos para activar</div>
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>Abrí Google Sheets y creá una hoja nueva (ej: "ANMA Presupuestos").</li>
                    <li>En el menú: <b>Extensiones → Apps Script</b>.</li>
                    <li>Pegá el código (botón "Copiar código" abajo) y guardá.</li>
                    <li>Hacé clic en <b>Implementar → Nueva implementación → Tipo: Aplicación web</b>.</li>
                    <li>En "Quién tiene acceso" elegí <b>"Cualquier usuario"</b> y autorizá.</li>
                    <li>Copiá la URL que termina en <code>/exec</code> y pegala abajo.</li>
                    <li>Tocá <b>"Probar conexión"</b> — deberías ver una fila "PING" en tu Sheet.</li>
                  </ol>
                </div>

                <div className="fg">
                  <label><i className="fa fa-link" style={{ marginRight: 4, color: '#0F9D58' }} />URL del Web App (Apps Script /exec)</label>
                  <input type="text" value={gsUrl} onChange={e => setGsUrl(e.target.value)} placeholder="https://script.google.com/macros/s/AKfycb.../exec" style={{ fontFamily: 'monospace', fontSize: 11 }} />
                </div>

                <div className="toggle-field">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Sincronización automática</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Envía cada presupuesto al Sheet apenas se guarda</div>
                  </div>
                  <button className={`toggle ${gsAuto ? 'on' : ''}`} onClick={() => setGsAuto(!gsAuto)} />
                </div>

                {gsLastSync && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: gsLastStatus === 'ok' ? 'rgba(52,168,83,.08)' : 'rgba(220,38,38,.08)', border: `1px solid ${gsLastStatus === 'ok' ? 'rgba(52,168,83,.3)' : 'rgba(220,38,38,.3)'}`, borderRadius: 8, fontSize: 11, marginTop: 6 }}>
                    <i className={`fa ${gsLastStatus === 'ok' ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ color: gsLastStatus === 'ok' ? '#0F9D58' : 'var(--red)' }} />
                    <span style={{ color: 'var(--txt2)' }}>Última sincronización:</span>
                    <b style={{ color: 'var(--txt)' }}>{new Date(gsLastSync).toLocaleString('es-AR')}</b>
                  </div>
                )}

                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={testSheets}><i className="fa fa-flask-vial" /> Probar conexión</button>
                  <button className="btn btn-primary btn-sm" onClick={saveSheetsConfig}><i className="fa fa-floppy-disk" /> Guardar integración</button>
                  <button className="btn btn-secondary btn-sm" onClick={syncAllBudgets} disabled={gsBulkLoading}>
                    <i className={`fa ${gsBulkLoading ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
                    {gsBulkLoading ? ' Enviando...' : ' Sincronizar todo'}
                  </button>
                </div>

                {gsTestResult && <div style={{ marginTop: 12, fontSize: 12 }} dangerouslySetInnerHTML={{ __html: gsTestResult }} />}

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', letterSpacing: '.5px', textTransform: 'uppercase' }}>
                      <i className="fa fa-code" style={{ marginRight: 6 }} />Código Apps Script
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setGsShowScript(!gsShowScript)}>
                        <i className={`fa fa-${gsShowScript ? 'eye-slash' : 'eye'}`} /> {gsShowScript ? 'Ocultar' : 'Ver'} código
                      </button>
                      <button className="btn btn-primary btn-xs" onClick={copyAppsScript}><i className="fa fa-copy" /> Copiar código</button>
                    </div>
                  </div>
                  {gsShowScript && (
                    <pre style={{ background: '#0F172A', color: '#E2E8F0', padding: '14px 16px', borderRadius: 10, fontSize: 10, maxHeight: 260, overflow: 'auto', fontFamily: 'Menlo, Monaco, monospace', lineHeight: 1.5, whiteSpace: 'pre', border: '1px solid var(--border)' }}>
                      {APPS_SCRIPT_TEMPLATE}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'equipo' && (
        <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
                <i className="fa fa-user-plus" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Invitar nuevo usuario</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>Enviá un email con link mágico para que se sume al sitio elegido</div>
              </div>
            </div>

            {invMsg && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 14,
                fontSize: 12,
                fontWeight: 600,
                background: invMsg.type === 'ok' ? 'rgba(16,185,129,.1)' : 'var(--red-lt)',
                border: `1.5px solid ${invMsg.type === 'ok' ? '#10B981' : '#FCA5A5'}`,
                color: invMsg.type === 'ok' ? '#047857' : 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i className={`fa ${invMsg.type === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                {invMsg.text}
              </div>
            )}

            <div style={{
              padding: 14, borderRadius: 12, marginBottom: 14,
              border: `2px solid ${CURRENT_SITE.color}`,
              background: `${CURRENT_SITE.color}12`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: CURRENT_SITE.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>
                <i className={`fa ${CURRENT_SITE.icon}`} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)' }}>{CURRENT_SITE.label}</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>El usuario recibirá acceso a este sitio</div>
              </div>
              <i className="fa fa-circle-check" style={{ color: CURRENT_SITE.color, fontSize: 16 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div className="fg">
                <label className="f-lbl">Email <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  type="email"
                  className="f-inp"
                  placeholder="persona@empresa.com"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendInviteHandler()}
                  disabled={invLoading}
                  style={{ padding: '9px 12px', fontSize: 13 }}
                />
              </div>
              <div className="fg">
                <label className="f-lbl">Nombre completo</label>
                <input
                  type="text"
                  className="f-inp"
                  placeholder="Juan Pérez"
                  value={invName}
                  onChange={(e) => setInvName(e.target.value)}
                  disabled={invLoading}
                  style={{ padding: '9px 12px', fontSize: 13 }}
                />
              </div>
            </div>

            <div className="fg" style={{ marginBottom: 16 }}>
              <label className="f-lbl">Rol en el sitio</label>
              <select
                value={invRole}
                onChange={(e) => setInvRole(e.target.value)}
                disabled={invLoading}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, background: 'var(--surface)', color: 'var(--txt)' }}
              >
                <option value="admin">Administrador — acceso total</option>
                <option value="user">Usuario — operación diaria</option>
                <option value="viewer">Solo lectura — reportes y consulta</option>
              </select>
            </div>

            <button
              className="btn btn-primary"
              onClick={sendInviteHandler}
              disabled={invLoading || !invEmail}
              style={{ width: '100%', padding: 11, fontSize: 13, fontWeight: 700 }}
            >
              {invLoading ? (
                <><i className="fa fa-spinner fa-spin" /> Enviando invitación...</>
              ) : (
                <><i className="fa fa-paper-plane" /> Enviar invitación</>
              )}
            </button>
          </div>

          <div className="card" style={{ background: 'var(--surface2)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-shield-halved" style={{ color: 'var(--brand)' }} />
              Seguridad
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.6 }}>
              Las invitaciones se envían a través de una Edge Function de Supabase que usa el <b>service_role key</b> solo del lado del servidor.
              Las URLs de destino están whitelist en la función y en el Dashboard de Supabase — si intentás invitar a un dominio no autorizado, el pedido es rechazado.
            </div>
          </div>
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
