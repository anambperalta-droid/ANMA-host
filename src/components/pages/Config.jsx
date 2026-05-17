import { useState, useEffect, useCallback } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { testMPConnection } from '../../lib/mercadopago'
import { applyThemeColors } from '../../lib/theme'
import { getSheetsConfig, setSheetsConfig, testSheetsConnection, pushAllBudgets, APPS_SCRIPT_TEMPLATE } from '../../lib/sheets'
import { SITES, CURRENT_SITE, sendInvite } from '../../lib/invites'
import { flushSync } from '../../lib/sync'

/* ── Modal de confirmación destructiva ── */
function DeleteConfirmModal({ title, message, onConfirm, onClose }) {
  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="mh">
          <h3><i className="fa fa-triangle-exclamation" style={{ color: 'var(--red)', marginRight: 8 }} />{title}</h3>
          <button className="mclose" onClick={onClose}><i className="fa fa-xmark" /></button>
        </div>
        <div style={{ padding: '12px 16px', background: 'var(--red-lt)', border: '1.5px solid #FCA5A5', borderRadius: 10, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <i className="fa fa-triangle-exclamation" style={{ color: 'var(--red)', marginTop: 2, flexShrink: 0, fontSize: 16 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B', lineHeight: 1.55, margin: 0, fontWeight: 500 }}>{message}</p>
        </div>
        <p style={{ fontSize: 11, color: 'var(--txt3)', margin: '0 0 16px', textAlign: 'center' }}>Esta acción es <b>irreversible</b> y no se puede deshacer.</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 36 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            <i className="fa fa-xmark" /> Cancelar
          </button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { onConfirm(); onClose() }}>
            <i className="fa fa-trash" /> Confirmar Eliminación
          </button>
        </div>
      </div>
    </div>
  )
}

function NewListCreator({ onCreate }) {
  const [label, setLabel] = useState('')
  const create = () => { if (label.trim()) { onCreate(label.trim()); setLabel('') } }
  return (
    <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
      <i className="fa fa-layer-group" style={{ color: 'var(--brand)', fontSize: 14, flexShrink: 0 }} />
      <input type="text" value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && create()}
        placeholder="Nombre para la nueva lista (ej: Colores, Regiones, Tamaños...)"
        style={{ flex: 1, padding: '7px 11px', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, outline: 'none', background: 'var(--surface)' }} />
      <button className="btn btn-primary btn-sm" disabled={!label.trim()} onClick={create}>
        <i className="fa fa-plus" /> Crear lista
      </button>
    </div>
  )
}

function ListEditor({ label, icon = 'fa-list', accentColor = 'var(--brand)', items, onAdd, onRemove, onDelete }) {
  const [val, setVal] = useState('')
  const [dupErr, setDupErr] = useState(false)
  const add = () => {
    if (!val.trim()) return
    if (items.some(i => i.toLowerCase() === val.trim().toLowerCase())) {
      setDupErr(true); setTimeout(() => setDupErr(false), 2500); return
    }
    onAdd(val.trim()); setVal('')
  }
  return (
    <div className="card" style={{ borderTop: `3px solid ${accentColor}`, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: accentColor + '18', color: accentColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
        }}>
          <i className={`fa ${icon}`} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)', lineHeight: 1.2 }}>{label}</div>
          <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 2 }}>
            {items.length} elemento{items.length !== 1 ? 's' : ''}
          </div>
        </div>
        {onDelete && (
          <button onClick={onDelete} title="Eliminar lista" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt4)',
            fontSize: 12, padding: '4px 6px', borderRadius: 6, display: 'flex',
            alignItems: 'center', gap: 4, flexShrink: 0, transition: 'color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--txt4)'}>
            <i className="fa fa-trash" style={{ fontSize: 11 }} /> Eliminar
          </button>
        )}
      </div>
      {items.length === 0 && (
        <div style={{ padding: '10px 0 6px', textAlign: 'center', color: 'var(--txt4)', fontSize: 12 }}>
          Sin elementos — agregá el primero ↓
        </div>
      )}
      <div style={{ marginBottom: items.length > 0 ? 8 : 0 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
            </div>
            <button className="list-del-btn" onClick={() => onRemove(i)}>
              <i className="fa fa-xmark" />
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text" value={val}
            onChange={e => { setVal(e.target.value); setDupErr(false) }}
            onKeyDown={e => e.key === 'Enter' && add()}
            style={{
              flex: 1, padding: '8px 16px',
              border: `2px solid ${dupErr ? '#FCA5A5' : 'var(--border)'}`,
              borderRadius: 9999, fontFamily: 'inherit', fontSize: 13, outline: 'none',
              transition: 'border-color .2s', background: 'var(--surface)', color: 'var(--txt)',
            }}
            placeholder="Nueva entrada..."
          />
          <button onClick={add} style={{
            width: 36, height: 36, borderRadius: 9999, border: 'none', cursor: 'pointer',
            background: accentColor, color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, flexShrink: 0,
            boxShadow: `0 2px 8px ${accentColor}40`, transition: 'filter .15s',
          }}>
            <i className="fa fa-plus" />
          </button>
        </div>
        {dupErr && (
          <div style={{ color: '#DC2626', fontSize: 11, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="fa fa-triangle-exclamation" /> Ya existe en la lista
          </div>
        )}
      </div>
    </div>
  )
}

export default function Config() {
  const { get, config, updateConfig } = useData()
  const { logout, changePassword, isGlobalAdmin, role } = useAuth()
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
  const [ivaEnabled, setIvaEnabled] = useState(c.ivaEnabled === true)
  const [ivaRate, setIvaRate] = useState(c.ivaRate ?? 21)
  const [otrosImp, setOtrosImp] = useState(c.otrosImpuestosRate ?? 0)
  const [cuit, setCuit] = useState(c.cuit || '')
  const [ptoVenta, setPtoVenta] = useState(c.ptoVenta || '')
  const [razonSocial, setRazonSocial] = useState(c.razonSocial || '')
  const [condIva, setCondIva] = useState(c.condIva || 'Responsable Inscripto')
  const [portalIntroCopy, setPortalIntroCopy] = useState(c.portalIntroCopy || '')
  const [portalShareMsg, setPortalShareMsg] = useState(c.portalShareMsg || '')
  const [mpEnabled, setMpEnabled] = useState(c.mpEnabled !== false)
  const [mpToken, setMpToken] = useState(c.mpToken || '')
  const [mpPubkey, setMpPubkey] = useState(c.mpPubkey || '')
  const [mpName, setMpName] = useState(c.mpName || '')
  const [mpCurrency, setMpCurrency] = useState(c.mpCurrency || 'ARS')
  const [mpSena, setMpSena] = useState(c.mpUseSena || false)
  const [mpTestResult, setMpTestResult] = useState('')
  const [showMpToken, setShowMpToken] = useState(false)
  const [opShowMetrics, setOpShowMetrics] = useState(c.opShowMetrics !== false)
  const [opShowCosts, setOpShowCosts] = useState(c.opShowCosts !== false)
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
  const [showPass, setShowPass] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
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

  /* ── Email (Resend) ── */
  const [resendKey, setResendKey] = useState(c.resendApiKey || '')
  const [resendFrom, setResendFrom] = useState(c.resendFrom || '')
  const [resendEnabled, setResendEnabled] = useState(c.resendEnabled === true)
  const [resendTesting, setResendTesting] = useState(false)
  const [resendTestResult, setResendTestResult] = useState(null) // null | 'ok' | 'error'
  const [resendShowInstructions, setResendShowInstructions] = useState(!c.resendApiKey)
  const [gsTesting, setGsTesting] = useState(false)
  const [gsShowInstructions, setGsShowInstructions] = useState(!initSheets.url)
  const [mpTesting, setMpTesting] = useState(false)
  const testResend = async () => {
    if (!resendKey.trim() || !resendFrom.trim()) { toast('Completá API Key y email de envío primero.', 'er'); return }
    setResendTesting(true)
    setResendTestResult(null)
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom.trim(),
          to: [resendFrom.trim()],
          subject: 'Test de conexión — ANMA Regalos',
          html: '<p>✅ La integración de email está funcionando correctamente.</p>',
        }),
      })
      if (res.ok) {
        setResendTestResult('ok')
        updateConfig({ resendApiKey: resendKey.trim(), resendFrom: resendFrom.trim(), resendEnabled: true })
        setResendEnabled(true)
        setResendShowInstructions(false)
      } else {
        setResendTestResult('error')
      }
    } catch (e) {
      setResendTestResult('error')
    }
    setResendTesting(false)
  }
  const saveResend = () => {
    updateConfig({ resendApiKey: resendKey.trim(), resendFrom: resendFrom.trim(), resendEnabled })
    flushSync()
    toast('Configuración de email guardada', 'ok')
  }

  /* ── Invitaciones / Equipo ── */
  const [invEmail, setInvEmail] = useState('')
  const [invName, setInvName] = useState('')
  const [invSite] = useState(CURRENT_SITE.key)
  const [invRole, setInvRole] = useState('operator')
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
      contactEmail: cEmail, contactWA: cWA.replace(/[^\d]/g, ''), contactIG: cIG, contactWeb: cWeb, address: cAddr,
      currency, numberFormat, budgetPrefix: prefix, defaultMargin: Number(defMargin), defaultDeposit: Number(defDeposit), validity: Number(validity),
      paymentConditions: conds, legalNote: legal,
      ivaEnabled, ivaRate: Number(ivaRate), otrosImpuestosRate: Number(otrosImp),
      cuit, ptoVenta, razonSocial, condIva,
      portalIntroCopy, portalShareMsg,
    })
    applyThemeColors(bcolor, acolor)
    flushSync()
    toast('Configuración guardada', 'ok')
  }

  const saveMPConfig = () => {
    updateConfig({ mpEnabled, mpToken, mpPubkey, mpName, mpCurrency, mpUseSena: mpSena })
    flushSync()
    toast('Configuración MP guardada', 'ok')
  }

  const saveBankConfig = () => {
    updateConfig({ bankEnabled, bankHolder, bankName, bankAccountType, bankCbu, bankAlias, bankCuit, bankNotes })
    flushSync()
    toast('Datos bancarios guardados', 'ok')
  }

  const saveSheetsConfig = () => {
    setSheetsConfig({ enabled: gsEnabled, url: gsUrl.trim(), autoSync: gsAuto })
    flushSync()
    toast('Integración con Google Sheets guardada', 'ok')
  }
  const testSheets = async () => {
    setGsTesting(true)
    setGsTestResult('<span style="color:var(--amber)"><i class="fa fa-spinner fa-spin"></i> Enviando ping...</span>')
    const r = await testSheetsConnection(gsUrl.trim())
    if (r.ok) {
      setGsTestResult(`<span style="color:var(--green)"><i class="fa fa-circle-check"></i> ${r.message}</span>`)
      setSheetsConfig({ enabled: gsEnabled, url: gsUrl.trim(), autoSync: gsAuto, lastSync: new Date().toISOString(), lastStatus: 'ok' })
      setGsLastSync(new Date().toISOString()); setGsLastStatus('ok')
      setGsShowInstructions(false)
    } else {
      setGsTestResult(`<span style="color:var(--red)"><i class="fa fa-circle-xmark"></i> ${r.message}</span>`)
    }
    setGsTesting(false)
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
    setMpTesting(true)
    setMpTestResult('<span style="color:var(--amber)"><i class="fa fa-spinner fa-spin"></i> Probando...</span>')
    const r = await testMPConnection(mpToken)
    if (r.ok) setMpTestResult(`<span style="color:var(--green)"><i class="fa fa-circle-check"></i> Conexión exitosa — ${r.count} métodos disponibles</span>`)
    else setMpTestResult(`<span style="color:var(--red)"><i class="fa fa-circle-xmark"></i> Error: ${r.message}</span>`)
    setMpTesting(false)
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
    reader.onload = (ev) => { updateConfig({ logo: ev.target.result }); flushSync(); toast('Logo actualizado', 'ok') }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => { updateConfig({ logo: '' }); flushSync(); toast('Logo eliminado', 'in') }

  const clearAll = () => {
    setDeleteConfirm({
      title: 'Eliminar TODOS los datos',
      message: 'Esta acción es irreversible. Se eliminarán todos los presupuestos, clientes, productos, proveedores y plantillas. No se puede deshacer.',
      onConfirm: () => {
        ['budgets', 'clients', 'products', 'suppliers', 'tariffs', 'shipments', 'waTemplates'].forEach(k => localStorage.removeItem('anma3_' + k))
        toast('Datos eliminados', 'in'); window.location.reload()
      },
    })
  }

  const doBackup = () => {
    const data = { budgets: get('budgets'), clients: get('clients'), products: get('products'), suppliers: get('suppliers'), tariffs: get('tariffs'), shipments: get('shipments'), waTemplates: get('waTemplates'), cfg: config() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ANMA_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }

  const doImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!window.confirm('Esto va a SOBRESCRIBIR los datos actuales con el backup. ¿Confirmás?')) return
        Object.entries(data).forEach(([k, v]) => {
          if (k === 'cfg') updateConfig(v)
          else updateConfig({ [k]: v })
        })
        const arrayKeys = ['budgets', 'clients', 'products', 'suppliers', 'tariffs', 'shipments', 'waTemplates']
        arrayKeys.forEach(k => { if (data[k]) localStorage.setItem('anma3_u_' + (JSON.parse(localStorage.getItem('anma3_currentUserId') || '""')) + '_' + k, JSON.stringify(data[k])) })
        toast('Backup importado', 'ok')
        setTimeout(() => window.location.reload(), 800)
      } catch (err) {
        toast('Error al importar: ' + err.message, 'err')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const [snapshots, setSnapshots] = useState([])
  const loadSnapshots = async () => {
    const { listSnapshots } = await import('../../lib/safeBackup')
    setSnapshots(await listSnapshots())
  }
  const doRestoreSnap = async (ts) => {
    if (!window.confirm('Esto va a restaurar el snapshot automático. Los datos actuales serán reemplazados. ¿Confirmás?')) return
    const { restoreSnapshot } = await import('../../lib/safeBackup')
    const ok = await restoreSnapshot(ts)
    if (ok) { toast('Snapshot restaurado', 'ok'); setTimeout(() => window.location.reload(), 800) }
    else toast('No se pudo restaurar', 'err')
  }

  const handleListAdd = (configKey, val) => { updateConfig({ [configKey]: [...(c[configKey] || []), val] }); flushSync() }
  const handleListRemove = (configKey, idx) => { updateConfig({ [configKey]: (c[configKey] || []).filter((_, i) => i !== idx) }); flushSync() }
  const handleCustomListAdd = (key, val) => {
    const lists = (c.customLists || []).map(cl => cl.key === key ? { ...cl, items: [...(cl.items || []), val] } : cl)
    updateConfig({ customLists: lists }); flushSync()
  }
  const handleCustomListRemove = (key, idx) => {
    const lists = (c.customLists || []).map(cl => cl.key === key ? { ...cl, items: (cl.items || []).filter((_, i) => i !== idx) } : cl)
    updateConfig({ customLists: lists }); flushSync()
  }
  const handleCreateCustomList = (label) => {
    const key = `custom_${Date.now()}`
    updateConfig({ customLists: [...(c.customLists || []), { key, label, items: [] }] }); flushSync()
  }
  const handleDeleteCustomList = (key) => {
    if (!window.confirm('¿Eliminar esta lista y todos sus elementos?')) return
    updateConfig({ customLists: (c.customLists || []).filter(cl => cl.key !== key) }); flushSync()
  }

  const userName = (c.email || '').split('@')[0] || 'Administrador'

  // "Equipo" visible para owners del workspace y global admin.
  // Operators/viewers no pueden invitar colaboradores.
  const canManageTeam = isGlobalAdmin || role === 'owner'

  const FEATURE_FLAGS = [
    { key: 'costoInterno',      icon: 'fa-eye-slash',    color: '#7C3AED', label: 'Costo interno visible',           desc: 'Muestra la columna de costo en la tabla de productos' },
    { key: 'margenTabla',       icon: 'fa-percent',      color: '#059669', label: 'Margen % en presupuestos',        desc: 'Muestra el margen de ganancia en cada ítem del presupuesto' },
    { key: 'descuentoCliente',  icon: 'fa-tag',          color: '#D97706', label: 'Descuento fijo por cliente',      desc: 'Permite asignar un % de descuento personalizado a cada cliente' },
    { key: 'notasInternas',     icon: 'fa-note-sticky',  color: '#2563EB', label: 'Notas internas en pedidos',       desc: 'Campo privado de notas en cada presupuesto (no aparece en el PDF)' },
    { key: 'alertaVencimiento', icon: 'fa-clock',        color: '#DC2626', label: 'Alerta de presupuestos vencidos', desc: 'Notifica cuando un presupuesto lleva más de 7 días sin respuesta' },
    { key: 'stockAvanzado',     icon: 'fa-boxes-stacked',color: '#0891B2', label: 'Stock avanzado por variante',     desc: 'Gestiona stock individual por talle, color u otra variante del producto' },
  ]

  const allTabs = [
    { id: 'identidad', icon: 'fa-building', label: 'Identidad' },
    { id: 'contacto', icon: 'fa-phone', label: 'Contacto' },
    { id: 'comercial', icon: 'fa-dollar-sign', label: 'Comercial' },
    { id: 'listas', icon: 'fa-list', label: 'Listas' },
    { id: 'modulos', icon: 'fa-sliders', label: 'Módulos' },
    { id: 'pagos', icon: 'fa-credit-card', label: 'Pagos' },
    { id: 'integraciones', icon: 'fa-plug', label: 'Integraciones' },
    { id: 'equipo', icon: 'fa-user-plus', label: 'Equipo' },
    { id: 'cuenta', icon: 'fa-shield-halved', label: 'Cuenta' },
  ]
  const tabs = allTabs.filter(t => t.id !== 'equipo' || canManageTeam)

  useEffect(() => {
    if (!canManageTeam && tab === 'equipo') setTab('identidad')
  }, [canManageTeam, tab])

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
        <div style={{
          flex: 1, display: 'flex', gap: 6,
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none', paddingBottom: 2,
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`cfg-tab-btn${tab === t.id ? ' active' : ''}`}
            >
              <i className={`fa ${t.icon}`} style={{ fontSize: 11 }} />
              {t.label}
            </button>
          ))}
        </div>
        <button className="cfg-save-desk" onClick={saveAll} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 36, padding: '0 18px', borderRadius: 9999, border: 'none',
          background: 'var(--color-principal)', color: '#fff',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 4px 14px var(--brand-dim)', transition: 'all .18s', flexShrink: 0,
        }}>
          <i className="fa fa-floppy-disk" /> Guardar cambios
        </button>
      </div>

      {tab === 'identidad' && (
        <div className="card" style={{ maxWidth: 900 }}>
          <div className="cfg-id-grid">
            {/* ── Columna Izquierda: Logo + Datos ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="cfg-logo-box" onClick={() => document.getElementById('logo-file').click()}>
                  {c.logo
                    ? <><img src={c.logo} alt="Logo" /><div className="cfg-logo-ov"><i className="fa fa-camera" /></div></>
                    : <><i className="fa fa-camera" style={{ fontSize: 26 }} /><span style={{ fontSize: 11, fontWeight: 600 }}>Subir logo</span></>
                  }
                </div>
                <input type="file" id="logo-file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                {c.logo && (
                  <button onClick={removeLogo} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--txt4)', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, transition: 'color .15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--txt4)'}>
                    <i className="fa fa-trash" style={{ fontSize: 10 }} /> Quitar logo
                  </button>
                )}
                <div style={{ fontSize: 10, color: 'var(--txt4)', textAlign: 'center' }}>PNG / JPG · máx 300 KB</div>
              </div>
              <div className="fg">
                <label>Nombre del negocio</label>
                <input type="text" value={bname} onChange={e => setBname(e.target.value)} placeholder="ANMA" style={{ borderRadius: 12 }} />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label>Subtítulo</label>
                <input type="text" value={bsub} onChange={e => setBsub(e.target.value)} placeholder="Tu negocio en un solo lugar" style={{ borderRadius: 12 }} />
              </div>
            </div>

            {/* ── Columna Derecha: Colores + Vista previa ── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: '20px 22px', border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 16 }}>
                <i className="fa fa-palette" style={{ marginRight: 6, color: 'var(--brand)' }} />Colores de marca
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                {/* Color Principal */}
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt2)', marginBottom: 8, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                    Color Principal
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="color" value={bcolor} onChange={e => handlePrincipalChange(e.target.value)}
                      style={{ width: 48, height: 48, border: '2px solid var(--border)', borderRadius: 12, cursor: 'pointer', padding: 3, background: 'var(--surface)' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: bcolor, fontFamily: 'monospace' }}>{bcolor.toUpperCase()}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 2 }}>Sidebar · botones · badges</div>
                    </div>
                  </div>
                </div>
                {/* Color Acento */}
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt2)', marginBottom: 8, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                    Color Acento
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="color" value={acolor} onChange={e => handleAcentoChange(e.target.value)}
                      style={{ width: 48, height: 48, border: '2px solid var(--border)', borderRadius: 12, cursor: 'pointer', padding: 3, background: 'var(--surface)' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: acolor, fontFamily: 'monospace' }}>{acolor.toUpperCase()}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 2 }}>Detalles · ganancias · estados</div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Vista previa en vivo */}
              <div style={{ borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                  Vista previa en vivo
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: bcolor }} />
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: acolor }} />
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${bcolor},${acolor})` }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ width: '60%', height: 8, borderRadius: 4, background: bcolor, marginBottom: 6, opacity: .9 }} />
                    <div style={{ width: '40%', height: 6, borderRadius: 4, background: acolor, opacity: .7 }} />
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={resetColors} style={{ marginTop: 12, width: '100%' }}>
                <i className="fa fa-rotate-left" /> Restaurar colores originales
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'contacto' && (
        <div style={{ maxWidth: 700 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="fa fa-phone" style={{ color: 'var(--brand)', fontSize: 14 }} />Datos de contacto
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <div className="fg"><label>Email</label><input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="hola@anma.com" style={{ borderRadius: 12 }} /></div>
              <div className="fg"><label>WhatsApp</label><input type="text" value={cWA} onChange={e => setCWA(e.target.value)} placeholder="+54 351 ..." style={{ borderRadius: 12 }} /></div>
              <div className="fg"><label>Instagram</label><input type="text" value={cIG} onChange={e => setCIG(e.target.value)} placeholder="@anma_regalos" style={{ borderRadius: 12 }} /></div>
              <div className="fg"><label>Sitio web</label><input type="text" value={cWeb} onChange={e => setCWeb(e.target.value)} placeholder="https://..." style={{ borderRadius: 12 }} /></div>
              <div className="fg" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <label>Dirección</label>
                <input type="text" value={cAddr} onChange={e => setCAddr(e.target.value)} placeholder="Av. Corrientes 1234, CABA" style={{ borderRadius: 12 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'comercial' && (
        <div style={{ maxWidth: 920 }}>
          <div className="cfg-com-grid">
            {/* LEFT: Configuración general */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className="fa fa-sliders" style={{ color: 'var(--brand)', fontSize: 14 }} />Configuración general
              </div>
              {/* Fila 1: Símbolo (72px fixed) + Formato (flex-1) */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="fg" style={{ width: 72, flexShrink: 0 }}>
                  <label>Símbolo</label>
                  <input type="text" value={currency} onChange={e => setCurrency(e.target.value)} style={{ borderRadius: 12 }} />
                </div>
                <div className="fg" style={{ flex: 1, minWidth: 0 }}>
                  <label>Formato de números</label>
                  <select value={numberFormat} onChange={e => setNumberFormat(e.target.value)} style={{ borderRadius: 12 }}>
                    <option value="es-AR">1.234.567 (punto miles — AR/ES)</option>
                    <option value="en-US">1,234,567 (coma miles — US/UK)</option>
                  </select>
                </div>
              </div>
              {/* Fila 2: Prefijo (100px fixed) + Margen (flex-1) */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="fg" style={{ width: 100, flexShrink: 0 }}>
                  <label>Prefijo</label>
                  <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} style={{ borderRadius: 12 }} />
                </div>
                <div className="fg" style={{ flex: 1, minWidth: 0 }}>
                  <label>Margen por defecto (%)</label>
                  <input type="number" value={defMargin} onChange={e => setDefMargin(e.target.value)} style={{ borderRadius: 12 }} />
                </div>
              </div>
              {/* Fila 3: Seña + Validez (50/50) */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="fg" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Seña por defecto (%)</label>
                  <input type="number" value={defDeposit} onChange={e => setDefDeposit(e.target.value)} style={{ borderRadius: 12 }} />
                </div>
                <div className="fg" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Validez (días)</label>
                  <input type="number" value={validity} onChange={e => setValidity(e.target.value)} style={{ borderRadius: 12 }} />
                </div>
              </div>
            </div>

            {/* RIGHT: Textos generales + Portal Proveedor (flex-col stack) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <i className="fa fa-align-left" style={{ color: 'var(--brand)', fontSize: 14 }} />Textos generales
                </div>
                <div className="fg">
                  <label>Condiciones de pago</label>
                  <textarea value={conds} onChange={e => setConds(e.target.value)} rows={4} style={{ borderRadius: 12 }} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Nota legal</label>
                  <textarea value={legal} onChange={e => setLegal(e.target.value)} rows={3} style={{ borderRadius: 12 }} />
                </div>
              </div>

              {/* Portal Proveedor */}
              <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  <i className="fa fa-share-nodes" style={{ color: 'var(--brand)' }} />
                  Portal Proveedor — textos personalizables
                </div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 10 }}>
                  Acá editás lo que dice el portal y el mensaje de WhatsApp. Si los dejás vacíos, se usan los textos por defecto.
                </div>
                <div className="fg">
                  <label>Mensaje principal del portal (debajo del saludo)</label>
                  <textarea value={portalIntroCopy} onChange={e => setPortalIntroCopy(e.target.value)} rows={2} style={{ borderRadius: 12 }}
                    placeholder="Ej: Te compartimos el detalle de productos que necesitamos. Revisá precios, condiciones y confirmá disponibilidad." />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Mensaje de WhatsApp al compartir el link</label>
                  <textarea value={portalShareMsg} onChange={e => setPortalShareMsg(e.target.value)} rows={3} style={{ borderRadius: 12 }}
                    placeholder="Hola {contacto}! Te paso el portal con el resumen del pedido y los productos que necesito. Tiene los precios acordados, las condiciones y un botón para confirmar." />
                  <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 4 }}>
                    Variables disponibles: <code>{'{contacto}'}</code>, <code>{'{proveedor}'}</code>, <code>{'{empresa}'}</code>, <code>{'{link}'}</code>, <code>{'{cant}'}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* IVA — full width below the two columns */}
          <div className="card" style={{ marginTop: 22 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={ivaEnabled} onChange={e => setIvaEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
              <i className="fa fa-file-invoice-dollar" style={{ color: 'var(--brand)' }} />
              Mostrar IVA en presupuesto / factura
            </label>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: ivaEnabled ? 10 : 0, marginLeft: 26 }}>
              Régimen de Transparencia Fiscal al Consumidor — Ley 27.743 (Argentina)
            </div>
            {ivaEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                <div className="fg"><label>Razón social</label><input type="text" value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Tu Empresa SRL" style={{ borderRadius: 12 }} /></div>
                <div className="fg"><label>CUIT</label><input type="text" value={cuit} onChange={e => setCuit(e.target.value)} placeholder="20-12345678-9" style={{ borderRadius: 12 }} /></div>
                <div className="fg"><label>Cond. frente al IVA</label>
                  <select value={condIva} onChange={e => setCondIva(e.target.value)} style={{ borderRadius: 12 }}>
                    <option>Responsable Inscripto</option>
                    <option>Monotributista</option>
                    <option>Exento</option>
                    <option>Consumidor Final</option>
                  </select>
                </div>
                <div className="fg"><label>Pto. Venta</label><input type="text" value={ptoVenta} onChange={e => setPtoVenta(e.target.value)} placeholder="00001" style={{ borderRadius: 12 }} /></div>
                <div className="fg"><label>Alícuota IVA (%)</label><input type="number" value={ivaRate} onChange={e => setIvaRate(e.target.value)} style={{ borderRadius: 12 }} /></div>
                <div className="fg" style={{ marginBottom: 0 }}><label>Otros Imp. Indirectos (%)</label><input type="number" value={otrosImp} onChange={e => setOtrosImp(e.target.value)} style={{ borderRadius: 12 }} /></div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'listas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          <ListEditor label="Modalidades de entrega" icon="fa-truck" accentColor="#D97706"
            items={c.deliveryModes || []} onAdd={v => handleListAdd('deliveryModes', v)} onRemove={i => handleListRemove('deliveryModes', i)} />
          <ListEditor label="Categorías de productos" icon="fa-tag" accentColor="#7C3AED"
            items={c.productCats || []} onAdd={v => handleListAdd('productCats', v)} onRemove={i => handleListRemove('productCats', i)} />
          <ListEditor label="Ocasiones" icon="fa-calendar-star" accentColor="#EC4899"
            items={c.occasions || []} onAdd={v => handleListAdd('occasions', v)} onRemove={i => handleListRemove('occasions', i)} />
          {(c.customLists || []).map((cl, idx) => {
            const COLORS = ['#8B5CF6','#06B6D4','#F59E0B','#10B981','#EF4444','#EC4899']
            return (
              <ListEditor key={cl.key} label={cl.label} icon="fa-layer-group"
                accentColor={COLORS[idx % COLORS.length]}
                items={cl.items || []}
                onAdd={v => handleCustomListAdd(cl.key, v)}
                onRemove={i => handleCustomListRemove(cl.key, i)}
                onDelete={() => handleDeleteCustomList(cl.key)} />
            )
          })}
        </div>
      )}

      {tab === 'modulos' && (
        <div style={{ maxWidth: 900 }}>
          <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <i className="fa fa-circle-info" style={{ color: 'var(--brand)', fontSize: 15 }} />
            Activá o desactivá funciones opcionales. Los cambios aplican <b>solo a tu cuenta</b>, no afectan a otros usuarios.
          </div>
          <div className="feat-grid">
          {FEATURE_FLAGS.map(f => {
            const active = !!(c.features?.[f.key])
            return (
              <div key={f.key} onClick={() => { updateConfig({ features: { ...(c.features || {}), [f.key]: !active } }); flushSync() }} style={{
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                padding: '14px 18px', background: 'var(--surface)',
                border: `1.5px solid ${active ? f.color + '50' : 'var(--border)'}`,
                borderRadius: 13, transition: 'border-color .2s, background .2s',
                userSelect: 'none',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                  background: active ? f.color + '18' : 'var(--surface2)',
                  color: active ? f.color : 'var(--txt4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  transition: 'background .2s, color .2s',
                }}>
                  <i className={`fa ${f.icon}`} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 3, lineHeight: 1.4 }}>{f.desc}</div>
                </div>
                <div style={{
                  width: 46, height: 26, borderRadius: 13, flexShrink: 0, position: 'relative',
                  background: active ? f.color : 'var(--border)', transition: 'background .22s',
                }}>
                  <span style={{
                    position: 'absolute', top: 4, left: active ? 24 : 4,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,.25)', transition: 'left .22s',
                  }} />
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {tab === 'pagos' && (
        <div style={{ display: 'grid', gap: 18, maxWidth: 780 }}>
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
                <div className="grid2">
                  <div className="fg">
                    <label>Access Token</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showMpToken ? 'text' : 'password'} value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-xxxxxxxx..." style={{ fontFamily: 'monospace', fontSize: 12, paddingRight: 36 }} />
                      <button type="button" onClick={() => setShowMpToken(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 13, padding: 4 }} title={showMpToken ? 'Ocultar token' : 'Mostrar token'}>
                        <i className={`fa ${showMpToken ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </button>
                    </div>
                  </div>
                  <div className="fg"><label>Public Key</label><input type="text" value={mpPubkey} onChange={e => setMpPubkey(e.target.value)} placeholder="APP_USR-xxxxxxxx..." style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
                </div>
                <div className="grid2">
                  <div className="fg"><label>Nombre visible</label><input type="text" value={mpName} onChange={e => setMpName(e.target.value)} placeholder="Mi Negocio" /></div>
                  <div className="fg"><label>Moneda</label><select value={mpCurrency} onChange={e => setMpCurrency(e.target.value)}><option value="ARS">ARS</option><option value="BRL">BRL</option><option value="CLP">CLP</option><option value="MXN">MXN</option><option value="USD">USD</option></select></div>
                </div>
                <div className="toggle-field">
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Cobrar solo la seña</div><div style={{ fontSize: 11, color: 'var(--txt3)' }}>Si está activo, el link cobra solo el % de seña configurada</div></div>
                  <button className={`toggle ${mpSena ? 'on' : ''}`} onClick={() => setMpSena(!mpSena)} />
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" onClick={testMP} disabled={mpTesting} style={{minHeight:44}}>
                    <i className={`fa ${mpTesting ? 'fa-spinner fa-spin' : 'fa-flask-vial'}`} />
                    {mpTesting ? ' Probando...' : ' Probar conexión'}
                  </button>
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
                </div>
                <div className="grid2">
                  <div className="fg"><label>Tipo de cuenta</label>
                    <select value={bankAccountType} onChange={e => setBankAccountType(e.target.value)}>
                      <option>Cuenta corriente</option>
                      <option>Caja de ahorro</option>
                      <option>Cuenta única</option>
                    </select>
                  </div>
                  <div className="fg"><label>CUIT / CUIL</label><input type="text" value={bankCuit} onChange={e => setBankCuit(e.target.value)} placeholder="20-12345678-9" /></div>
                </div>
                <div className="grid2">
                  <div className="fg">
                    <label><i className="fa fa-hashtag" style={{ marginRight: 4, color: 'var(--acento)' }} />CBU (22 dígitos)</label>
                    <div style={{ position: 'relative' }}>
                      <input type="text" value={bankCbu} onChange={e => setBankCbu(e.target.value.replace(/\s/g, ''))} placeholder="0000000000000000000000" maxLength={22} style={{ fontFamily: 'monospace', letterSpacing: '.5px', paddingRight: 36 }} />
                      <button type="button" disabled={!bankCbu} onClick={() => bankCbu && navigator.clipboard.writeText(bankCbu).then(() => toast('CBU copiado', 'ok'))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: bankCbu ? 'var(--brand)' : 'var(--txt4)', cursor: bankCbu ? 'pointer' : 'default', fontSize: 13, padding: 4 }} title="Copiar CBU">
                        <i className="fa fa-copy" />
                      </button>
                    </div>
                  </div>
                  <div className="fg">
                    <label><i className="fa fa-at" style={{ marginRight: 4, color: 'var(--acento)' }} />Alias</label>
                    <div style={{ position: 'relative' }}>
                      <input type="text" value={bankAlias} onChange={e => setBankAlias(e.target.value)} placeholder="mi.negocio.arg" style={{ fontFamily: 'monospace', paddingRight: 36 }} />
                      <button type="button" disabled={!bankAlias} onClick={() => bankAlias && navigator.clipboard.writeText(bankAlias).then(() => toast('Alias copiado', 'ok'))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: bankAlias ? 'var(--brand)' : 'var(--txt4)', cursor: bankAlias ? 'pointer' : 'default', fontSize: 13, padding: 4 }} title="Copiar Alias">
                        <i className="fa fa-copy" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid2">
                  <div className="fg"><label>Notas adicionales (opcional)</label><input type="text" value={bankNotes} onChange={e => setBankNotes(e.target.value)} placeholder="Ej: Enviar comprobante por WhatsApp al finalizar." /></div>
                  <div />
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
            Conectá ANMA con herramientas externas.
          </div>

          {/* ── WHATSAPP CARD ── */}
          <div className="pay-card on">
            <div className="pay-card-head">
              <div className="pay-icon" style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)' }}>
                <i className="fa-brands fa-whatsapp" />
              </div>
              <div className="pay-head-txt">
                <div className="pay-head-title">WhatsApp</div>
                <div className="pay-head-sub">Mensajes y pedidos de reposición directo desde la app</div>
              </div>
              <div className="pay-status on"><i className="fa fa-circle-check" /> ACTIVO</div>
            </div>
            <div className="pay-card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { icon: 'fa-paper-plane', color: '#25D366', title: 'Enviar presupuesto', desc: 'Botón directo en cada presupuesto para compartirlo por WA' },
                  { icon: 'fa-rotate',      color: '#128C7E', title: 'Re-orden a proveedor', desc: 'Mensaje automático de reposición con lista de productos' },
                  { icon: 'fa-share-nodes', color: '#25D366', title: 'Portal de proveedor', desc: 'Compartir el portal de catálogo y precios acordados' },
                  { icon: 'fa-link',        color: '#128C7E', title: 'Click-to-chat',      desc: 'Cada contacto tiene su botón de WA para abrir la conversación' },
                ].map(f => (
                  <div key={f.title} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(37,211,102,.07)', border: '1px solid rgba(37,211,102,.2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: f.color + '22', color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                      <i className={`fa ${f.icon}`} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{f.title}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 2, lineHeight: 1.4 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.25)', fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.6 }}>
                <i className="fa fa-circle-info" style={{ color: '#D97706', marginRight: 6 }} />
                <b>¿Querés importar tus contactos de WhatsApp?</b> WhatsApp no permite leer contactos desde apps externas. Pero podés exportarlos desde tu teléfono:
                <br />
                <span style={{ color: 'var(--txt3)', fontSize: 11 }}>
                  Android: Contactos → Más → Exportar → Seleccioná los contactos → Guardar como .vcf
                  &nbsp;·&nbsp; iOS: Contactos → Compartir → Guardar archivo .vcf
                </span>
                <br />
                <span style={{ fontWeight: 700, color: '#D97706' }}>Luego usá el botón "Importar .vcf" en la sección Clientes.</span>
              </div>
            </div>
          </div>

          {/* ── EMAIL (RESEND) CARD ── */}
          <div className={`pay-card ${resendEnabled ? 'on' : ''}`}>
            <div className="pay-card-head" onClick={() => setResendEnabled(!resendEnabled)}>
              <div className="pay-icon" style={{ background: 'linear-gradient(135deg,#000,#333)' }}>
                <i className="fa fa-envelope" />
              </div>
              <div className="pay-head-txt">
                <div className="pay-head-title">Email — Resend <span style={{ fontSize: 9, padding: '2px 7px', background: 'var(--brand-xlt)', color: 'var(--brand)', borderRadius: 20, marginLeft: 6, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>Nuevo</span></div>
                <div className="pay-head-sub">Enviá presupuestos en PDF directamente por email desde la app</div>
              </div>
              <div className={`pay-status ${resendEnabled ? 'on' : ''}`}>
                {resendEnabled ? <><i className="fa fa-circle-check" /> ACTIVO</> : <><i className="fa fa-circle" /> INACTIVO</>}
              </div>
              <button className={`toggle ${resendEnabled ? 'on' : ''}`} onClick={e => { e.stopPropagation(); setResendEnabled(!resendEnabled) }} />
            </div>
            {resendEnabled && (
              <div className="pay-card-body">
                {resendShowInstructions ? (
                  <div style={{ background: 'rgba(0,0,0,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 11, color: 'var(--txt2)', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Cómo obtener tu API Key gratis:</div>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Entrá a <b>resend.com</b> y creá una cuenta gratuita (hasta 3.000 emails/mes gratis).</li>
                      <li>En el dashboard: <b>API Keys → Create API Key</b>.</li>
                      <li>Copiá la key y pegala abajo.</li>
                      <li>En "Email de envío" usá <b>onboarding@resend.dev</b> si no verificaste tu dominio todavía.</li>
                    </ol>
                  </div>
                ) : (
                  <button onClick={() => setResendShowInstructions(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--brand)', padding: '0 0 14px', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                    <i className="fa fa-circle-info" style={{ fontSize: 10 }} /> Ver instrucciones de configuración ▾
                  </button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label><i className="fa fa-key" style={{ marginRight: 4, color: '#000' }} />API Key de Resend</label>
                    <input type="password" value={resendKey} onChange={e => setResendKey(e.target.value)}
                      placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                      style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </div>
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label><i className="fa fa-at" style={{ marginRight: 4 }} />Email de envío</label>
                    <input type="email" value={resendFrom} onChange={e => setResendFrom(e.target.value)}
                      placeholder="tu@empresa.com" />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn btn-ghost" onClick={testResend} disabled={resendTesting} style={{minHeight:44}}>
                    <i className={`fa ${resendTesting ? 'fa-spinner fa-spin' : 'fa-flask-vial'}`} />
                    {resendTesting ? ' Enviando...' : ' Probar conexión'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={saveResend}>
                    <i className="fa fa-floppy-disk" /> Guardar
                  </button>
                  {resendTestResult && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: resendTestResult === 'ok' ? 'rgba(16,185,129,.1)' : 'rgba(220,38,38,.1)', color: resendTestResult === 'ok' ? '#059669' : 'var(--red)', border: `1.5px solid ${resendTestResult === 'ok' ? 'rgba(16,185,129,.35)' : 'rgba(220,38,38,.35)'}` }}>
                      <i className={`fa ${resendTestResult === 'ok' ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
                      {resendTestResult === 'ok' ? 'Conexión exitosa' : 'Error de credenciales'}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 12, padding: '9px 13px', borderRadius: 9, background: 'rgba(124,58,237,.07)', border: '1px solid rgba(124,58,237,.2)', fontSize: 11, color: 'var(--txt2)', lineHeight: 1.5 }}>
                  <i className="fa fa-circle-check" style={{ color: 'var(--brand)', marginRight: 6 }} />
                  Una vez configurado, en cada presupuesto aparece el botón <b>"Enviar por email"</b> que manda el PDF al cliente automáticamente.
                </div>
              </div>
            )}
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

                {gsShowInstructions ? (<>
                  {[
                    { n:1, title:'Copiá el código', desc: <>Hacé clic en <b>"Copiar código"</b> (abajo). Dejalo en el portapapeles.</> },
                    { n:2, title:'Abrí tu Google Sheet', desc: <>En el menú de la hoja: <b>Extensiones → Apps Script</b>. Se abre el editor.</> },
                    { n:3, title:'Pegá y guardá', desc: <>Borrá todo lo que hay, pegá el código (Ctrl+V) y guardá con <b>Ctrl+S</b>. Poné cualquier nombre al proyecto.</> },
                    { n:4, title:'Implementar', desc: <><b>Implementar → Nueva implementación</b>. En "Tipo" elegí <b>Aplicación web</b>. En "Quién tiene acceso" elegí <b>Cualquier usuario</b>. Clic en <b>Implementar</b>.</> },
                    { n:5, title:'Autorizá (paso normal)', desc: <><b>Google va a mostrar una advertencia.</b> Es normal — el script es tuyo. Hacé clic en <b>"Configuración avanzada"</b> (abajo a la izquierda) → <b>"Ir al proyecto (no es seguro)"</b> → <b>Permitir</b>.</>, warn: true },
                    { n:6, title:'Copiá la URL', desc: <>Copiá la URL larga que termina en <code style={{fontSize:10}}>/exec</code> y pegala en el campo de abajo.</> },
                    { n:7, title:'Probá la conexión', desc: <>Tocá <b>"Probar conexión"</b>. Si aparece una fila nueva en tu Sheet, ¡listo!</> },
                  ].map(s => (
                    <div key={s.n} style={{ display:'flex', gap:12, marginBottom:10, alignItems:'flex-start' }}>
                      <div style={{ width:24, height:24, borderRadius:'50%', background: s.warn ? '#D97706' : '#0F9D58', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0, marginTop:1 }}>{s.n}</div>
                      <div style={{ fontSize:12, color:'var(--txt2)', lineHeight:1.6 }}>
                        <b style={{ color: s.warn ? '#92400E' : 'var(--txt)', display:'block', marginBottom:2 }}>{s.warn && '⚠️ '}{s.title}</b>
                        {s.desc}
                        {s.warn && <div style={{ marginTop:4, padding:'6px 10px', borderRadius:8, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', fontSize:11, color:'#92400E' }}>
                          Si ves "Google no verificó esta app" → <b>Configuración avanzada → Ir al proyecto → Permitir</b>. Tu script, tu cuenta — es seguro.
                        </div>}
                      </div>
                    </div>
                  ))}
                </>) : (
                  <button onClick={() => setGsShowInstructions(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--brand)', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                    <i className="fa fa-circle-info" style={{ fontSize: 10 }} /> Ver instrucciones de configuración ▾
                  </button>
                )}

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
                  <button className="btn btn-ghost" onClick={testSheets} disabled={gsTesting} style={{minHeight:44}}>
                    <i className={`fa ${gsTesting ? 'fa-spinner fa-spin' : 'fa-flask-vial'}`} />
                    {gsTesting ? ' Probando...' : ' Probar conexión'}
                  </button>
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
        <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
          {/* ── Permisos del Operador ── */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--txt)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-user-gear" style={{ color: 'var(--brand)', fontSize: 16 }} />
              Permisos del Operador
            </div>
            <div className="toggle-field">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Mostrar Facturación y Métricas</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>Dashboard: totales cobrados, gráficos e indicadores financieros</div>
              </div>
              <button className={`toggle ${opShowMetrics ? 'on' : ''}`} onClick={() => { const v = !opShowMetrics; setOpShowMetrics(v); updateConfig({ opShowMetrics: v }); flushSync() }} />
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
            <div className="toggle-field">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Mostrar Costos y Márgenes</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>Catálogo: columna de costo y rentabilidad por producto</div>
              </div>
              <button className={`toggle ${opShowCosts ? 'on' : ''}`} onClick={() => { const v = !opShowCosts; setOpShowCosts(v); updateConfig({ opShowCosts: v }); flushSync() }} />
            </div>
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa fa-circle-info" style={{ color: 'var(--brand)', fontSize: 12 }} />
              Los precios Minorista y Mayorista siempre son visibles para el operador.
            </div>
          </div>

          {/* ── 2 columnas: info + invitación ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'start' }}>
          {/* Cómo funciona */}
          <div style={{ padding: '14px 18px', borderRadius: 14, background: 'var(--surface2)', border: '1.5px solid var(--border)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>💡</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)', marginBottom: 4 }}>¿Cómo funciona?</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.7 }}>
                Ingresá el email de tu colaborador y elegí qué puede hacer. Le llega un correo con un link para activar su cuenta. Listo.
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { icon: 'fa-user-shield', color: '#7C3AED', label: 'Administrador', desc: 'Ve todo: costos, configuración y equipo' },
                  { icon: 'fa-user-gear',   color: '#0891B2', label: 'Operador',       desc: 'Pedidos, clientes y logística. Sin configuración ni costos' },
                  { icon: 'fa-eye',         color: '#6B7280', label: 'Solo lectura',   desc: 'Consulta y reportes, sin poder editar nada' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: r.color + '18', color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                      <i className={`fa ${r.icon}`} />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
                      <b style={{ color: 'var(--txt)' }}>{r.label}</b> — {r.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Formulario */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--txt)', marginBottom: 16 }}>
              <i className="fa fa-user-plus" style={{ color: 'var(--brand)', marginRight: 8 }} />
              Invitar colaborador
            </div>

            {invMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                fontSize: 12, fontWeight: 600,
                background: invMsg.type === 'ok' ? 'rgba(16,185,129,.1)' : 'var(--red-lt)',
                border: `1.5px solid ${invMsg.type === 'ok' ? '#10B981' : '#FCA5A5'}`,
                color: invMsg.type === 'ok' ? '#047857' : 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i className={`fa ${invMsg.type === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                {invMsg.text}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="f-lbl">Email <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="email" className="f-inp" placeholder="persona@empresa.com"
                  value={invEmail} onChange={e => setInvEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInviteHandler()}
                  disabled={invLoading} style={{ padding: '9px 12px', fontSize: 13 }} />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="f-lbl">Nombre</label>
                <input type="text" className="f-inp" placeholder="Juan Pérez"
                  value={invName} onChange={e => setInvName(e.target.value)}
                  disabled={invLoading} style={{ padding: '9px 12px', fontSize: 13 }} />
              </div>
            </div>

            <div className="fg" style={{ marginBottom: 16 }}>
              <label className="f-lbl">¿Qué puede hacer?</label>
              <select value={invRole} onChange={e => setInvRole(e.target.value)} disabled={invLoading}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, background: 'var(--surface)', color: 'var(--txt)' }}>
                <option value="admin">Administrador — acceso total</option>
                <option value="operator">Operador — operación diaria sin configuración</option>
                <option value="viewer">Solo lectura — consulta sin editar</option>
              </select>
            </div>

            <button className="btn btn-primary" onClick={sendInviteHandler}
              disabled={invLoading || !invEmail}
              style={{ width: '100%', padding: 11, fontSize: 13, fontWeight: 700 }}>
              {invLoading
                ? <><i className="fa fa-spinner fa-spin" /> Enviando...</>
                : <><i className="fa fa-paper-plane" /> Enviar invitación por email</>}
            </button>
          </div>
          </div>
        </div>
      )}

      {tab === 'cuenta' && (
        <div style={{ display: 'grid', gap: 20, maxWidth: 700 }}>
          {/* ── Colaboradores (solo para owners) ── */}
          {canManageTeam && (
            <div style={{
              padding: '14px 18px', borderRadius: 14,
              background: 'linear-gradient(135deg, var(--brand)10, var(--surface2))',
              border: '1.5px solid var(--brand)30',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, flexShrink: 0 }}>
                <i className="fa fa-users" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)' }}>Colaboradores</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                  Invitá a tu equipo para que acceda a la app con su propio usuario y contraseña.
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setTab('equipo')} style={{ flexShrink: 0, fontWeight: 700 }}>
                <i className="fa fa-user-plus" /> Agregar usuario
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff' }}>{(userName[0] || 'A').toUpperCase()}</div>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>{userName}</div><div style={{ fontSize: 12, color: 'var(--txt3)' }}>Usuario activo</div></div>
            </div>
            <div className="fg"><label>Email de cuenta</label><input type="email" value={acctEmail} onChange={e => setAcctEmail(e.target.value)} /></div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', letterSpacing: '.8px', textTransform: 'uppercase', margin: '8px 0 14px' }}>Cambiar contraseña</div>
            <div className="fg">
              <label>Nueva contraseña</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" style={{ paddingRight: 36 }} />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 13, padding: 4 }} title={showPass ? 'Ocultar' : 'Mostrar'}>
                  <i className={`fa ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>
            <div className="fg">
              <label>Repetir</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={repPass} onChange={e => setRepPass(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" style={{ paddingRight: 36 }} />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 13, padding: 4 }} title={showPass ? 'Ocultar' : 'Mostrar'}>
                  <i className={`fa ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleChangePass}><i className="fa fa-key" /> Actualizar contraseña</button>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Sistema</div>
            {[['Versión', 'ANMA v3.0'], ['Clientes', get('clients').length], ['Presupuestos', get('budgets').length], ['Productos', get('products').length], ['Proveedores', get('suppliers').length]].map(([l, v], i) => (
              <div key={i} className="metric-row"><span className="mr-label">{l}</span><span className="mr-val">{v}</span></div>
            ))}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={doBackup}><i className="fa fa-cloud-arrow-down" /> Exportar backup JSON</button>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <i className="fa fa-upload" /> Importar backup JSON
                <input type="file" accept="application/json" onChange={doImport} style={{ display: 'none' }} />
              </label>
              <button className="btn btn-secondary btn-sm" onClick={loadSnapshots}><i className="fa fa-clock-rotate-left" /> Ver snapshots automáticos</button>
              {snapshots.length > 0 && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--surface2)', borderRadius: 8, fontSize: 11, maxHeight: 200, overflowY: 'auto' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--txt2)' }}>Snapshots disponibles ({snapshots.length}):</div>
                  {snapshots.map(s => (
                    <div key={s.ts} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{new Date(s.ts).toLocaleString('es-AR')} <span style={{ color: 'var(--txt3)' }}>· {s.keys} keys</span></span>
                      <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 10 }} onClick={() => doRestoreSnap(s.ts)}>Restaurar</button>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-danger btn-sm" onClick={clearAll}><i className="fa fa-trash" /> Limpiar todos los datos</button>
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" onClick={logout}><i className="fa fa-right-from-bracket" /> Cerrar sesión</button>
            </div>
          </div>
          </div>{/* cierra grid 2 columnas */}
        </div>
      )}

      {deleteConfirm && (
        <DeleteConfirmModal
          title={deleteConfirm.title}
          message={deleteConfirm.message}
          onConfirm={deleteConfirm.onConfirm}
          onClose={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── Mobile floating save bar ── */}
      <div className="cfg-mob-save">
        <button onClick={saveAll}>
          <i className="fa fa-floppy-disk" /> Guardar cambios
        </button>
      </div>
    </div>
  )
}
