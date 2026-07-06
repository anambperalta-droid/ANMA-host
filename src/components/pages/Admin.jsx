import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useRealtimeSignups, ensureNotificationPermission, sendBrowserNotification } from '../../lib/useRealtimeSignups'
import { getBillingStatus, STATUS, MONTHLY_AMOUNT, ONBOARDING_AMOUNT, buildPaymentReminderWAMessage, fmtMoney, fmtShortDate } from '../../lib/subscription'

/**
 * ANMA Regalos — Admin global (cross-tenant)
 *
 * Vista profesional para gestionar workspaces, trials y conversiones.
 * 3 tabs principales:
 *   1. Trials   — usuarios en período de prueba (priorizados por urgencia)
 *   2. Pagados  — clientes que ya convirtieron
 *   3. Todos    — vista completa con filtros manuales
 *
 * + métricas headline (cards) que dan el pulso del negocio de un vistazo.
 */

const SITE_KEY = 'anma-regalos'
const TRIAL_DAYS = 7
const RECOVERY_WINDOW_DAYS = 14   // mostramos trials expirados hasta N días post-vencimiento

// Mapeo plan → seats por default
const PLANS = [
  { key: 'solo',      label: 'Solo',      seats: 0 },
  { key: 'equipo',    label: 'Equipo',    seats: 2 },
  { key: 'pro',       label: 'Pro',       seats: 5 },
  { key: 'unlimited', label: 'Ilimitado', seats: 999 },
]

// ── Helpers ─────────────────────────────────────────────────────────────
const daysSince = (iso) => {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const deriveTrialState = (ws) => {
  // Trial = workspace plan 'solo' + recién creado
  if (ws.plan !== 'solo') return { isTrial: false, label: ws.plan, daysLeft: null, urgency: 'paid' }
  const age = daysSince(ws.created_at)
  const daysLeft = TRIAL_DAYS - age
  if (daysLeft >= 4) return { isTrial: true, daysLeft, urgency: 'fresh', label: `${daysLeft}d` }
  if (daysLeft >= 2) return { isTrial: true, daysLeft, urgency: 'warm', label: `${daysLeft}d` }
  if (daysLeft >= 1) return { isTrial: true, daysLeft, urgency: 'hot',  label: `${daysLeft}d` }
  if (daysLeft === 0) return { isTrial: true, daysLeft, urgency: 'last', label: 'HOY' }
  // Expirado pero dentro de la ventana de recovery
  if (daysLeft >= -RECOVERY_WINDOW_DAYS) return { isTrial: true, daysLeft, urgency: 'expired', label: `vencido ${-daysLeft}d` }
  return { isTrial: false, label: 'vencido', daysLeft, urgency: 'lost' }
}

// Conversion-likely signal: cuántos datos cargó el workspace
const deriveTemperature = (data) => {
  if (!data) return { level: 'cold', icon: '❄️', label: 'Sin uso', tone: '#94A3B8' }
  const budgets  = Array.isArray(data.budgets)  ? data.budgets.length  : 0
  const clients  = Array.isArray(data.clients)  ? data.clients.length  : 0
  const products = Array.isArray(data.products) ? data.products.length : 0
  if (budgets >= 5 || clients >= 10) return { level: 'hot',  icon: '🔥', label: 'Caliente', tone: '#DC2626' }
  if (budgets >= 1 || clients >= 3 || products >= 3) return { level: 'warm', icon: '🌡️', label: 'Tibio', tone: '#D97706' }
  return { level: 'cold', icon: '❄️', label: 'Frío', tone: '#94A3B8' }
}

const urgencyTone = (u) => ({
  fresh:   { bg: 'rgba(124,58,237,.10)', fg: '#7C3AED' },
  warm:    { bg: 'rgba(217,119,6,.12)',  fg: '#D97706' },
  hot:     { bg: 'rgba(220,38,38,.12)',  fg: '#DC2626' },
  last:    { bg: '#DC2626',              fg: '#fff' },
  expired: { bg: 'rgba(148,163,184,.18)', fg: '#475569' },
  paid:    { bg: 'rgba(22,163,74,.12)',  fg: '#16A34A' },
  lost:    { bg: 'rgba(148,163,184,.12)', fg: '#94A3B8' },
}[u] || { bg: 'var(--surface2)', fg: 'var(--txt3)' })

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Mensaje WhatsApp pre-cargado para contactar prospect / cliente
// según su estado real de facturación y trial. Cada kind arma una copy
// distinta enfocada en la acción concreta que corresponde.
const waLink = (wsName, kind = 'trial', phone = '') => {
  const wsRef = wsName ? ` (${wsName})` : ''
  const msgs = {
    // Trials
    trial:     `¡Hola! Soy Ana de ANMA Regalos. Vi que estás probando el sistema${wsRef}. ¿Cómo va? Si necesitás una mano armando algún kit o cotización, estoy acá.`,
    expiring:  `¡Hola! Te escribo desde ANMA Regalos${wsRef}. Tu prueba está por vencer y no quiero que pierdas tus datos ni el flujo que armaste. ¿Charlamos para activar tu plan?`,
    expired:   `¡Hola! Tu prueba de ANMA Regalos terminó${wsRef}. Tus datos siguen guardados 90 días — si querés retomar exactamente donde quedaste, con el pago de ingreso de $120.000 activo tu plan y arrancamos.`,
    // Cobros — cuota mensual $30k
    overdue:   `¡Hola! Te escribo por la cuota mensual de ANMA Regalos${wsRef} — quedó pendiente y quería avisarte antes de que se pause. En un rato te paso el link para regularizarla ($30.000 por Mercado Pago o transferencia). Cualquier duda estoy.`,
    due_soon:  `¡Hola! Te escribo desde ANMA Regalos${wsRef}. Se viene el vencimiento de tu cuota mensual ($30.000). Si querés te paso el link ahora para dejarlo resuelto — así arrancás el mes tranquila.`,
    paused:    `¡Hola! Tu workspace de ANMA Regalos${wsRef} está pausado por la cuota impaga. Tus datos siguen guardados (90 días). Reactivamos apenas regularicemos — te paso el link cuando me digas.`,
    // Al día
    paid:      `¡Hola! Soy Ana de ANMA Regalos. ¿Cómo está yendo todo con el sistema${wsRef}? Cualquier cosa que necesites, estoy acá.`,
  }
  const text = msgs[kind] || msgs.trial
  const p = String(phone || '').replace(/[^\d]/g, '')
  return p
    ? `https://wa.me/${p}?text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
}

// ── Componente ──────────────────────────────────────────────────────────
export default function Admin() {
  const { isGlobalAdmin, user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('trials')        // 'trials' | 'paid' | 'all'
  const [expanded, setExpanded] = useState(null)
  const [members, setMembers] = useState({})
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', business_name: '', full_name: '' })
  const [creatingUser, setCreatingUser] = useState(false)

  const handleCreateUser = async () => {
    const { email, password, business_name, full_name } = newUserForm
    if (!email || !password) { alert('Email y contraseña son obligatorios'); return }
    if (password.length < 6) { alert('La contraseña debe tener al menos 6 caracteres'); return }
    setCreatingUser(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-user', {
        body: { email: email.trim().toLowerCase(), password, business_name: business_name.trim(), full_name: full_name.trim() },
      })
      if (fnErr) {
        let msg = fnErr.message || 'Error en la función'
        const ctx = fnErr.context
        if (ctx && typeof ctx === 'object') {
          try {
            const res = typeof ctx.clone === 'function' ? ctx.clone() : ctx
            const raw = await res.text()
            try { const b = JSON.parse(raw); if (b?.error) msg = b.error } catch { /* noop */ }
          } catch { /* noop */ }
        }
        alert('No se pudo crear: ' + msg)
        return
      }
      if (data?.error) { alert(data.error); return }
      alert(`✓ Usuario creado.\n\nEmail: ${email}\nContraseña: ${password}\n\nPasale estas credenciales al cliente — ya puede ingresar.`)
      setShowCreateUser(false)
      setNewUserForm({ email: '', password: '', business_name: '', full_name: '' })
      await load()
    } catch (e) {
      alert('Error inesperado: ' + (e.message || e))
    } finally {
      setCreatingUser(false)
    }
  }
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  const [recentSignups, setRecentSignups] = useState([])  // últimos signups detectados en vivo
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      // 1. Actividad por usuario en ESTE sitio (anma-regalos). Es info enriquecedora,
      //    NO un filtro — necesitamos ver tambien a quienes se registraron pero
      //    aun no abrieron la app (sin row en anma_user_data todavia).
      const { data: siteUsers, error: e0 } = await supabase
        .from('anma_user_data')
        .select('user_id, updated_at, data')
        .eq('site_key', SITE_KEY)
      if (e0) throw e0
      const userActivity = new Map()
      ;(siteUsers || []).forEach(r => userActivity.set(r.user_id, { updated_at: r.updated_at, data: r.data }))
      // Set de workspaces con actividad SOLO en otra app: para excluirlos.
      const { data: otherSiteUsers } = await supabase
        .from('anma_user_data')
        .select('user_id')
        .neq('site_key', SITE_KEY)
      const otherSiteSet = new Set((otherSiteUsers || []).map(r => r.user_id))

      // 2. Workspaces — TODOS los registrados. Excluimos solo los que tienen
      //    actividad EXCLUSIVA en otra app.
      const { data: wss, error: e1 } = await supabase
        .from('workspaces')
        .select('id, name, plan, seats_allowed, status, created_at, subscription_status, activated_at, next_payment_due_at, last_payment_at, lifetime_revenue, contact_email, contact_phone')
        .order('created_at', { ascending: false })
      if (e1) throw e1
      const scopedWss = (wss || []).filter(w => {
        if (userActivity.has(w.id)) return true
        if (otherSiteSet.has(w.id))   return false
        return true
      })

      // 3. Memberships
      const { data: mems, error: e2 } = await supabase
        .from('memberships')
        .select('id, workspace_id, role, status, user_id, created_at')
      if (e2) throw e2

      const scopedWsSet = new Set(scopedWss.map(w => w.id))
      const used = {}
      const byWs = {}
      ;(mems || []).forEach(m => {
        if (!scopedWsSet.has(m.workspace_id)) return
        if (m.role !== 'owner' && (m.status === 'active' || m.status === 'invited')) {
          used[m.workspace_id] = (used[m.workspace_id] || 0) + 1
        }
        byWs[m.workspace_id] = byWs[m.workspace_id] || []
        byWs[m.workspace_id].push(m)
      })

      // 4. Enriquecer cada workspace (trial + billing + temperature)
      const enriched = scopedWss.map(w => {
        const act = userActivity.get(w.id) || {}
        return {
          ...w,
          seats_used: used[w.id] || 0,
          last_activity: act.updated_at,
          trial: deriveTrialState(w),
          temp:  deriveTemperature(act.data),
          billing: getBillingStatus(w),
        }
      })

      setRows(enriched)
      setMembers(byWs)
    } catch (e) {
      setErr(e.message || 'Error cargando workspaces')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isGlobalAdmin) load() }, [isGlobalAdmin, load])

  // ── Realtime: nuevos signups en vivo ──────────────────────────────────
  // Solo activo si es admin global. El hook escucha INSERT en `workspaces`
  // y dispara toast + browser notification + refresh.
  useRealtimeSignups((newWs) => {
    if (!newWs?.id) return
    const wsName = newWs.name || 'Nuevo workspace'
    toast(`🎉 Nuevo signup: ${wsName}`, 'ok')
    const n = sendBrowserNotification('Nuevo signup en ANMA Regalos', {
      body: `${wsName} acaba de registrarse. Mirá tu Admin para contactarlos.`,
      tag: 'anma-signup',
    })
    if (n) { n.onclick = () => { window.focus(); n.close() } }
    setRecentSignups(prev => [{ id: newWs.id, name: wsName, at: Date.now() }, ...prev].slice(0, 10))
    load()
  }, isGlobalAdmin)

  const enableNotifs = async () => {
    const perm = await ensureNotificationPermission()
    setNotifPerm(perm)
    if (perm === 'granted') {
      sendBrowserNotification('Notificaciones activadas ✓', {
        body: 'Te avisaremos cuando alguien nuevo se registre.',
        tag: 'anma-notif-test',
      })
      toast('Notificaciones activadas. Te avisaremos en vivo.', 'ok')
    } else if (perm === 'denied') {
      toast('Bloqueadas. Activalas desde la barra del navegador.', 'in')
    }
  }

  // ── Generar link MP $30k (mensual) y abrir WhatsApp ─────────────────
  // Llamamos a /api/mp-create-preference y devolvemos el init_point.
  // El admin lo manda al cliente vía WhatsApp con un mensaje pre-cargado.
  const generateMpLinkAndShare = async (w) => {
    try {
      toast(`Generando link MP para ${w.name}…`, 'in')
      const resp = await fetch('/api/mp-create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: w.id,
          kind: 'monthly',
          userEmail: w.contact_email || undefined,
        }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.message || 'Error generando link')
      // Copiar al portapapeles + abrir WhatsApp con mensaje pre-cargado
      try { await navigator.clipboard.writeText(data.init_point) } catch { /* ignorar */ }
      const msg = buildPaymentReminderWAMessage({
        workspaceName: w.name,
        mpLink: data.init_point,
        kind: 'monthly',
      })
      const phone = (w.contact_phone || '').replace(/[^\d]/g, '')
      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
      window.open(waUrl, '_blank')
      toast('Link copiado + WhatsApp abierto', 'ok')
    } catch (e) {
      toast(`Error: ${e?.message || 'No se pudo generar el link'}`, 'er')
    }
  }

  // ── Registrar pago manual (transferencia, efectivo, MP externo) ─────
  // Estado del modal para pago manual (reemplaza prompts encadenados).
  // El markAsPaid ahora solo abre el modal — el submit final llama al API.
  const markAsPaid = (w) => {
    setPayModalFor(w)
    setPayForm({
      kind: 'onboarding', amount: ONBOARDING_AMOUNT,
      method: 'transferencia', notes: '',
    })
  }

  // ── Submit del modal: dispara el registro real del pago ────────────
  const submitManualPayment = async () => {
    if (!payModalFor) return
    const w = payModalFor
    const amount = Number(payForm.amount) || 0
    if (amount <= 0) { toast('Monto inválido', 'er'); return }
    const label = payForm.kind === 'onboarding' ? `pago de ingreso (${fmtMoney(amount)})`
                : payForm.kind === 'monthly'    ? `cuota mensual (${fmtMoney(amount)})`
                : `pago manual (${fmtMoney(amount)})`
    const notesFull = `${label} — ${payForm.method}${payForm.notes ? ` · ${payForm.notes}` : ''}`
    setPayLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { toast('Sin sesión activa', 'er'); return }
      const resp = await fetch('/api/mark-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId: w.id,
          amount,
          kind: 'manual',
          notes: notesFull,
        }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.message || 'Error')
      toast(`Pago registrado: ${fmtMoney(amount)} · ${label}`, 'ok')
      setPayModalFor(null)
      await load()
    } catch (e) {
      toast(`Error: ${e?.message || 'No se pudo registrar el pago'}`, 'er')
    } finally {
      setPayLoading(false)
    }
  }

  // ── Reconciliar pago con Mercado Pago ────────────────────────────────
  // Uso: cuando el webhook no llegó y Ana ve el pago en su panel de MP.
  // Pega el ID del pago (el número que aparece en MP) y el sistema lo
  // sincroniza contra nuestra DB.
  const reconcilePaymentWithMP = async () => {
    const paymentId = prompt(
      'Reconciliar un pago de Mercado Pago con la base:\n\n' +
      '1. Andá a mercadopago.com.ar → Actividad\n' +
      '2. Copiá el ID del pago (número largo)\n' +
      '3. Pegalo acá:'
    )
    if (!paymentId || !paymentId.trim()) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { toast('Sin sesión activa', 'er'); return }
      toast('Consultando Mercado Pago…', 'in')
      const resp = await fetch('/api/reconcile-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ paymentId: paymentId.trim() }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.message || 'Error reconciliando')
      const actionLabel = data.action === 'created' ? 'Pago registrado ✓'
        : data.action === 'updated' ? 'Estado actualizado ✓'
        : 'Ya estaba sincronizado ✓'
      toast(`${actionLabel} · ${fmtMoney(data.amount)} · ${data.mp_status}`, 'ok')
      await load()
    } catch (e) {
      toast(`Error: ${e?.message || 'No se pudo reconciliar'}`, 'er')
    }
  }

  // ── Ver historial de pagos del workspace ────────────────────────────
  const [paymentHistoryFor, setPaymentHistoryFor] = useState(null)
  // Modal de pago manual
  const [payModalFor, setPayModalFor] = useState(null)
  const [payForm, setPayForm] = useState({ kind: 'onboarding', amount: ONBOARDING_AMOUNT, method: 'transferencia', notes: '' })
  const [payLoading, setPayLoading] = useState(false)
  // Actualizar amount al cambiar kind (excepto si eligió "otro")
  const setPayKind = (kind) => {
    if (kind === 'onboarding') setPayForm(f => ({ ...f, kind, amount: ONBOARDING_AMOUNT }))
    else if (kind === 'monthly') setPayForm(f => ({ ...f, kind, amount: MONTHLY_AMOUNT }))
    else setPayForm(f => ({ ...f, kind, amount: '' }))
  }
  // Selección múltiple en tab billing (bulk cobros)
  const [selectedBilling, setSelectedBilling] = useState(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const toggleBillingSelection = (wsId) => {
    setSelectedBilling(prev => {
      const next = new Set(prev)
      if (next.has(wsId)) next.delete(wsId)
      else next.add(wsId)
      return next
    })
  }
  const clearBillingSelection = () => setSelectedBilling(new Set())

  // Bulk: generar links MP para todos los seleccionados + abrir WA con cada uno
  const bulkGenerateLinks = async () => {
    const ids = Array.from(selectedBilling)
    if (ids.length === 0) return
    if (!confirm(`Generar links MP de $30k para ${ids.length} workspace${ids.length !== 1 ? 's' : ''} y abrir WhatsApp con cada uno?\n\n(Tu navegador puede bloquear pop-ups — autorizá si te pregunta.)`)) return
    setBulkProcessing(true)
    let success = 0
    let failed = 0
    for (const wsId of ids) {
      const w = rows.find(r => r.id === wsId)
      if (!w) { failed++; continue }
      try {
        const resp = await fetch('/api/mp-create-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: w.id,
            kind: 'monthly',
            userEmail: w.contact_email || undefined,
          }),
        })
        const data = await resp.json()
        if (!data.ok) throw new Error(data.message)
        const msg = buildPaymentReminderWAMessage({
          workspaceName: w.name,
          mpLink: data.init_point,
          kind: 'monthly',
        })
        const phone = (w.contact_phone || '').replace(/[^\d]/g, '')
        const waUrl = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
          : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
        // Abrir cada WA en pestaña nueva
        window.open(waUrl, '_blank')
        success++
        // Pausa breve entre llamados para no romper rate limit ni pop-up blocker
        await new Promise(r => setTimeout(r, 400))
      } catch {
        failed++
      }
    }
    setBulkProcessing(false)
    toast(`${success} link${success !== 1 ? 's' : ''} generado${success !== 1 ? 's' : ''}${failed > 0 ? ` · ${failed} falló${failed !== 1 ? 'aron' : ''}` : ''}`, failed > 0 ? 'in' : 'ok')
    clearBillingSelection()
  }
  const [paymentHistory, setPaymentHistory] = useState([])
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false)
  const showPaymentHistory = async (w) => {
    setPaymentHistoryFor(w)
    setPaymentHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('workspace_payments')
        .select('*')
        .eq('workspace_id', w.id)
        .order('paid_at', { ascending: false })
      if (error) throw error
      setPaymentHistory(data || [])
    } catch (e) {
      toast(`Error cargando historial: ${e?.message || ''}`, 'er')
    } finally {
      setPaymentHistoryLoading(false)
    }
  }

  // ── Acciones admin ─────────────────────────────────────────────────────
  const changePlan = async (wsId, planKey) => {
    const p = PLANS.find(x => x.key === planKey)
    if (!p) return
    const { error } = await supabase.from('workspaces')
      .update({ plan: p.key, seats_allowed: p.seats })
      .eq('id', wsId)
    if (error) { alert(error.message); return }
    await load()
  }

  const setSeats = async (wsId, seats) => {
    const n = parseInt(seats, 10)
    if (Number.isNaN(n) || n < 0) return
    const { error } = await supabase.from('workspaces')
      .update({ seats_allowed: n })
      .eq('id', wsId)
    if (error) { alert(error.message); return }
    await load()
  }

  const toggleStatus = async (wsId, current) => {
    const next = current === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('workspaces')
      .update({ status: next })
      .eq('id', wsId)
    if (error) { alert(error.message); return }
    await load()
  }

  /** Eliminación TOTAL — auth.users + workspace + memberships + data. IRREVERSIBLE. */
  const deleteUserHard = async (wsId, displayName) => {
    const c1 = confirm(`⚠️ ELIMINAR COMPLETAMENTE a "${displayName}"\n\nEsto borra:\n• La cuenta de auth (Supabase)\n• El workspace + todos sus datos\n• Sus memberships\n• Su histórico\n\n❗ Es IRREVERSIBLE.\n\n¿Continuar?`)
    if (!c1) return
    const c2 = prompt(`Para confirmar, escribí el nombre exacto del workspace:\n\n"${displayName}"`)
    if (c2 !== displayName) {
      if (c2 !== null) alert('El nombre no coincide. Cancelado por seguridad.')
      return
    }
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('delete-user', {
        body: { user_id: wsId },
      })
      if (fnErr) {
        let msg = fnErr.message || 'Error en la función'
        const ctx = fnErr.context
        if (ctx && typeof ctx === 'object') {
          try {
            const res = typeof ctx.clone === 'function' ? ctx.clone() : ctx
            const raw = await res.text()
            try { const b = JSON.parse(raw); if (b?.error) msg = b.error } catch { /* noop */ }
          } catch { /* noop */ }
        }
        alert('No se pudo eliminar: ' + msg)
        return
      }
      if (data?.error) { alert(data.error); return }
      alert(`✓ ${displayName} eliminado completamente.\n\nYa puede volver a registrarse con el mismo email.`)
      await load()
    } catch (e) {
      alert('Error inesperado: ' + (e.message || e))
    }
  }

  const revokeMember = async (mId) => {
    if (!confirm('¿Revocar este miembro? No podrá seguir accediendo.')) return
    const { error } = await supabase.from('memberships')
      .update({ status: 'revoked' })
      .eq('id', mId)
    if (error) { alert(error.message); return }
    await load()
  }

  // ── Filtrado por tab ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (tab === 'trials') {
      return rows
        .filter(w => w.trial.isTrial)
        .sort((a, b) => {
          const order = { last: 0, hot: 1, warm: 2, fresh: 3, expired: 4 }
          return (order[a.trial.urgency] ?? 99) - (order[b.trial.urgency] ?? 99)
        })
    }
    if (tab === 'billing') {
      // COBROS: workspaces activos/vencidos (NO trials), priorizados por urgencia
      return rows
        .filter(w => [STATUS.ACTIVE, STATUS.PENDING_PAYMENT, STATUS.PAUSED, STATUS.PENDING_SETUP].includes(w.billing.status))
        .sort((a, b) => {
          // Prioridad: paused (urgente recovery) > overdue > hot > warm > ok > fresh
          const order = { paused: 0, overdue: 1, hot: 2, warm: 3, ok: 4, fresh: 5 }
          return (order[a.billing.urgency] ?? 99) - (order[b.billing.urgency] ?? 99)
        })
    }
    if (tab === 'paid') {
      return rows.filter(w => w.billing.isPaying)
    }
    return rows
  }, [rows, tab])

  // ── Tareas del día (TodayWidget) ────────────────────────────────────────
  // Calcula las 4 acciones críticas que el admin debe ver al entrar.
  const todayTasks = useMemo(() => {
    const tasks = []

    // 1. Cobros vencidos HOY o anteayer (acción urgente)
    const overdueToday = rows.filter(w => w.billing.urgency === 'overdue' && w.billing.daysUntilDue !== null && w.billing.daysUntilDue >= -2)
    if (overdueToday.length > 0) {
      tasks.push({
        kind: 'overdue',
        urgency: 'critical',
        icon: 'fa-fire',
        color: '#DC2626',
        title: `${overdueToday.length} cuota${overdueToday.length !== 1 ? 's' : ''} vencida${overdueToday.length !== 1 ? 's' : ''}`,
        subtitle: 'Cobrá antes de que pasen a paused',
        workspaces: overdueToday,
        ctaLabel: 'Ver y cobrar',
      })
    }

    // 2. Vencen hoy o mañana (próximos 1-2 días)
    const dueSoon = rows.filter(w => w.billing.urgency === 'hot' && w.billing.daysUntilDue !== null && w.billing.daysUntilDue >= 0 && w.billing.daysUntilDue <= 1)
    if (dueSoon.length > 0) {
      tasks.push({
        kind: 'due_soon',
        urgency: 'high',
        icon: 'fa-hourglass-half',
        color: '#D97706',
        title: `${dueSoon.length} cuota${dueSoon.length !== 1 ? 's' : ''} vence${dueSoon.length === 1 ? '' : 'n'} en 24-48h`,
        subtitle: 'Adelantá el contacto para evitar fricción',
        workspaces: dueSoon,
        ctaLabel: 'Enviar recordatorio',
      })
    }

    // 3. Trials a punto de cerrar (último día)
    const trialsClosing = rows.filter(w => w.trial.isTrial && (w.trial.urgency === 'last' || w.trial.urgency === 'hot'))
    if (trialsClosing.length > 0) {
      tasks.push({
        kind: 'trial_closing',
        urgency: 'high',
        icon: 'fa-rocket',
        color: '#7C3AED',
        title: `${trialsClosing.length} trial${trialsClosing.length !== 1 ? 's' : ''} cierra${trialsClosing.length === 1 ? '' : 'n'} pronto`,
        subtitle: 'Última oportunidad de conversión',
        workspaces: trialsClosing,
        ctaLabel: 'Contactar',
      })
    }

    // 4. Prospectos calientes en trial (alta intención de compra)
    const hotProspects = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0 && w.temp.level === 'hot')
    if (hotProspects.length > 0) {
      tasks.push({
        kind: 'hot_prospects',
        urgency: 'medium',
        icon: 'fa-temperature-three-quarters',
        color: '#16A34A',
        title: `${hotProspects.length} prospecto${hotProspects.length !== 1 ? 's' : ''} caliente${hotProspects.length !== 1 ? 's' : ''}`,
        subtitle: 'Cargaron muchos datos — listos para convertir',
        workspaces: hotProspects,
        ctaLabel: 'Ver prospectos',
      })
    }

    return tasks
  }, [rows])

  const goToTask = (task) => {
    if (task.kind === 'overdue' || task.kind === 'due_soon') {
      setTab('billing')
      window.scrollTo({ top: 350, behavior: 'smooth' })
    } else if (task.kind === 'trial_closing' || task.kind === 'hot_prospects') {
      setTab('trials')
      window.scrollTo({ top: 350, behavior: 'smooth' })
    }
  }

  // ── Métricas headline ──────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const trialsActivos = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0).length
    const vencenPronto  = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0 && w.trial.daysLeft <= 2).length
    const hotProspects  = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0 && w.temp.level === 'hot').length
    // Cobros
    const pagados        = rows.filter(w => w.billing.isPaying).length
    const cuotasVencidas = rows.filter(w => [STATUS.PENDING_PAYMENT, STATUS.PAUSED].includes(w.billing.status)).length
    const vencenSemana   = rows.filter(w => w.billing.status === STATUS.ACTIVE && w.billing.daysUntilDue !== null && w.billing.daysUntilDue >= 0 && w.billing.daysUntilDue <= 7).length
    const mrrPotencial   = pagados * MONTHLY_AMOUNT
    const revenueTotal   = rows.reduce((sum, w) => sum + (Number(w.lifetime_revenue) || 0), 0)
    return { trialsActivos, vencenPronto, hotProspects, pagados, cuotasVencidas, vencenSemana, mrrPotencial, revenueTotal }
  }, [rows])

  if (!isGlobalAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)' }}>
        <i className="fa fa-lock" style={{ fontSize: 36, marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>Acceso restringido</div>
        <div style={{ fontSize: 13 }}>Panel solo para administradores globales.</div>
      </div>
    )
  }

  return (
    <div className="pg" style={{ padding: '16px 20px' }}>
      <style>{`
        .admin-mcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;transition:transform .15s,box-shadow .15s}
        .admin-mcard:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.06)}
        .admin-mcard-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .admin-mcard-val{font-size:22px;font-weight:800;color:var(--txt);line-height:1;letter-spacing:-.3px}
        .admin-mcard-lbl{font-size:11px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
        .admin-mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px}

        .admin-tabs{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:3px;gap:1px;margin-bottom:14px}
        .admin-tab{padding:8px 18px;border:none;background:none;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--txt3);transition:all .15s;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
        .admin-tab.active{background:var(--surface);color:var(--txt);box-shadow:0 1px 3px rgba(0,0,0,.08);font-weight:700}
        .admin-tab .chip{background:var(--brand);color:#fff;font-size:10px;font-weight:800;padding:1px 7px;border-radius:99px;min-width:18px;text-align:center}
        .admin-tab.active .chip{background:var(--brand)}
        .admin-tab:not(.active) .chip{background:var(--surface3);color:var(--txt2)}

        .trial-row{transition:background .15s}
        .trial-row:hover{background:var(--surface2)}
        .trial-actions a,.trial-actions button{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--txt2);font-size:11.5px;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit;transition:all .12s;white-space:nowrap}
        .trial-actions a:hover,.trial-actions button:hover{border-color:var(--brand);color:var(--brand)}
        .trial-actions .wa-btn{background:#25D366;color:#fff;border-color:#25D366}
        .trial-actions .wa-btn:hover{background:#1eb755;color:#fff;border-color:#1eb755}

        .urgency-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap}

        @media(max-width:780px){
          .admin-tabs{display:flex;width:100%;overflow-x:auto;scrollbar-width:none}
          .admin-tabs::-webkit-scrollbar{display:none}
          .admin-tab{flex-shrink:0}
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.3px' }}>
            <i className="fa fa-shield-halved" style={{ marginRight: 8, color: '#7C3AED' }} />
            Admin · ANMA Regalos
          </h1>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
            Gestión cross-tenant · {user?.email}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {notifPerm !== 'granted' && (
            <button
              className="btn btn-secondary"
              onClick={enableNotifs}
              title={notifPerm === 'denied' ? 'Notificaciones bloqueadas en el navegador — activalas manualmente' : 'Activar notificaciones del navegador'}
              style={notifPerm === 'denied' ? { opacity: .7 } : { background: 'rgba(124,58,237,.08)', color: '#7C3AED', borderColor: 'rgba(124,58,237,.25)' }}
            >
              <i className={`fa ${notifPerm === 'denied' ? 'fa-bell-slash' : 'fa-bell'}`} style={{ marginRight: 6 }} />
              {notifPerm === 'denied' ? 'Notif. bloqueadas' : 'Activar avisos'}
            </button>
          )}
          {notifPerm === 'granted' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(22,163,74,.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,.25)', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
              <i className="fa fa-bell" /> Avisos en vivo activos
            </span>
          )}
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: 6 }} />
            Refrescar
          </button>
          <button
            className="btn btn-secondary"
            onClick={reconcilePaymentWithMP}
            title="Sincronizar un pago desde Mercado Pago cuando el webhook no llegó"
            style={{ background: 'rgba(0,158,247,.08)', color: '#009EE3', borderColor: 'rgba(0,158,247,.25)' }}
          >
            <i className="fa fa-rotate" style={{ marginRight: 6 }} />
            Reconciliar MP
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateUser(true)}>
            <i className="fa fa-user-plus" style={{ marginRight: 6 }} />
            Crear usuario
          </button>
        </div>
      </div>

      {/* Banner de signups recientes detectados en esta sesión */}
      {recentSignups.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'linear-gradient(90deg, rgba(124,58,237,.08), rgba(99,102,241,.05))', border: '1px solid rgba(124,58,237,.25)', borderRadius: 10, fontSize: 12.5, color: 'var(--txt2)' }}>
          <i className="fa fa-bolt" style={{ color: '#7C3AED', marginRight: 6 }} />
          <strong>{recentSignups.length} signup{recentSignups.length !== 1 ? 's' : ''} en esta sesión:</strong>{' '}
          {recentSignups.slice(0, 3).map((s, i) => (
            <span key={s.id}>
              {i > 0 && ' · '}
              {s.name}
            </span>
          ))}
          {recentSignups.length > 3 && ` +${recentSignups.length - 3} más`}
          <button onClick={() => setRecentSignups([])} style={{ marginLeft: 10, background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 11 }}>
            <i className="fa fa-xmark" />
          </button>
        </div>
      )}

      {/* ── Widget "Tareas de hoy" ───────────────────────────────────── */}
      {!loading && todayTasks.length > 0 && (
        <div style={{
          marginBottom: 18,
          background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
          border: '1.5px solid #FDE68A',
          borderRadius: 14,
          padding: '14px 18px 16px',
          boxShadow: '0 2px 10px rgba(217,119,6,.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg, #D97706, #F59E0B)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13,
              }}>
                <i className="fa fa-bolt" />
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#78350F', letterSpacing: '-.2px' }}>
                  Tareas de hoy
                </div>
                <div style={{ fontSize: 11, color: '#92400E', opacity: .8 }}>
                  {todayTasks.length} acción{todayTasks.length !== 1 ? 'es' : ''} prioritaria{todayTasks.length !== 1 ? 's' : ''} · {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {todayTasks.map((task, i) => (
              <div
                key={i}
                onClick={() => goToTask(task)}
                role="button"
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && goToTask(task)}
                style={{
                  background: 'rgba(255,255,255,.7)',
                  border: '1px solid rgba(217,119,6,.18)',
                  borderRadius: 12,
                  padding: '11px 13px',
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                  display: 'flex', alignItems: 'center', gap: 11,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#fff'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.7)'
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${task.color}18`,
                  color: task.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>
                  <i className={`fa ${task.icon}`} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1f2937', lineHeight: 1.3 }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {task.subtitle}
                  </div>
                </div>
                <i className="fa fa-arrow-right" style={{ color: task.color, fontSize: 11, flexShrink: 0, opacity: .7 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin tareas → mensaje positivo */}
      {!loading && todayTasks.length === 0 && rows.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '11px 16px',
          background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
          border: '1px solid #86EFAC', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: '#065F46',
        }}>
          <i className="fa fa-circle-check" style={{ color: '#10B981', fontSize: 16 }} />
          <div>
            <strong>Todo bajo control hoy.</strong>{' '}
            <span style={{ opacity: .8 }}>Sin cobros pendientes ni trials a punto de cerrar.</span>
          </div>
        </div>
      )}

      {/* ── Métricas headline ────────────────────────────────────────── */}
      <div className="admin-mgrid">
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(124,58,237,.12)', color: '#7C3AED' }}>
            <i className="fa fa-rocket" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.trialsActivos}</div>
            <div className="admin-mcard-lbl">Trials activos</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(220,38,38,.12)', color: '#DC2626' }}>
            <i className="fa fa-hourglass-half" />
          </div>
          <div>
            <div className="admin-mcard-val" style={{ color: metrics.vencenPronto > 0 ? '#DC2626' : undefined }}>
              {metrics.vencenPronto}
            </div>
            <div className="admin-mcard-lbl">Vencen en 48h</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(217,119,6,.12)', color: '#D97706' }}>
            <i className="fa fa-fire" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.hotProspects}</div>
            <div className="admin-mcard-lbl">Prospectos calientes</div>
          </div>
        </div>
        <div className="admin-mcard" onClick={() => setTab('billing')} style={{ cursor: 'pointer' }} title="Ver tab Cobros">
          <div className="admin-mcard-ico" style={{ background: 'rgba(220,38,38,.12)', color: '#DC2626' }}>
            <i className="fa fa-exclamation-circle" />
          </div>
          <div>
            <div className="admin-mcard-val" style={{ color: metrics.cuotasVencidas > 0 ? '#DC2626' : undefined }}>
              {metrics.cuotasVencidas}
            </div>
            <div className="admin-mcard-lbl">Cuotas vencidas</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(22,163,74,.12)', color: '#16A34A' }}>
            <i className="fa fa-check-circle" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.pagados}</div>
            <div className="admin-mcard-lbl">Clientes pagos</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(124,58,237,.12)', color: '#7C3AED' }}>
            <i className="fa fa-dollar-sign" />
          </div>
          <div>
            <div className="admin-mcard-val" style={{ fontSize: 18 }}>{fmtMoney(metrics.mrrPotencial)}</div>
            <div className="admin-mcard-lbl">MRR potencial</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(99,102,241,.12)', color: '#6366F1' }}>
            <i className="fa fa-chart-line" />
          </div>
          <div>
            <div className="admin-mcard-val" style={{ fontSize: 18 }}>{fmtMoney(metrics.revenueTotal)}</div>
            <div className="admin-mcard-lbl">Revenue total</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'trials' ? 'active' : ''}`} onClick={() => setTab('trials')}>
          <i className="fa fa-rocket" /> Trials <span className="chip">{rows.filter(w => w.trial.isTrial).length}</span>
        </button>
        <button className={`admin-tab ${tab === 'billing' ? 'active' : ''}`} onClick={() => setTab('billing')}>
          <i className="fa fa-credit-card" /> Cobros
          {metrics.cuotasVencidas > 0 && <span className="chip" style={{ background: '#DC2626' }}>{metrics.cuotasVencidas}</span>}
          {metrics.cuotasVencidas === 0 && <span className="chip">{rows.filter(w => [STATUS.ACTIVE, STATUS.PENDING_PAYMENT, STATUS.PAUSED, STATUS.PENDING_SETUP].includes(w.billing.status)).length}</span>}
        </button>
        <button className={`admin-tab ${tab === 'paid' ? 'active' : ''}`} onClick={() => setTab('paid')}>
          <i className="fa fa-check" /> Pagados <span className="chip">{metrics.pagados}</span>
        </button>
        <button className={`admin-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          <i className="fa fa-list" /> Todos <span className="chip">{rows.length}</span>
        </button>
      </div>

      {err && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fa fa-triangle-exclamation" style={{ marginRight: 6 }} />{err}
        </div>
      )}

      {/* ── Bulk actions bar (solo tab billing con selección) ──────────── */}
      {tab === 'billing' && selectedBilling.size > 0 && (
        <div style={{
          marginBottom: 10, padding: '12px 16px',
          background: 'linear-gradient(135deg, #EDE9FE, #C7D2FE)',
          border: '1.5px solid #A78BFA',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          boxShadow: '0 4px 14px rgba(124,58,237,.12)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #7C3AED, #6366F1)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, flexShrink: 0,
          }}>
            <i className="fa fa-check" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#4C1D95' }}>
              {selectedBilling.size} workspace{selectedBilling.size !== 1 ? 's' : ''} seleccionado{selectedBilling.size !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 11.5, color: '#6D28D9', opacity: .85, marginTop: 2 }}>
              Total a cobrar: <strong>{fmtMoney(selectedBilling.size * MONTHLY_AMOUNT)}</strong>
            </div>
          </div>
          <button
            onClick={bulkGenerateLinks}
            disabled={bulkProcessing}
            style={{
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #25D366, #1eb955)',
              color: '#fff', fontSize: 12.5, fontWeight: 700,
              cursor: bulkProcessing ? 'wait' : 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(37,211,102,.35)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: bulkProcessing ? .7 : 1,
            }}
          >
            {bulkProcessing ? (
              <><i className="fa fa-spinner fa-spin" /> Procesando…</>
            ) : (
              <><i className="fa-brands fa-whatsapp" /> Generar links + WhatsApp ({selectedBilling.size})</>
            )}
          </button>
          <button
            onClick={clearBillingSelection}
            style={{
              padding: '9px 14px', borderRadius: 10,
              background: 'transparent', border: '1.5px solid #A78BFA',
              color: '#6D28D9', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <i className="fa fa-xmark" /> Cancelar
          </button>
        </div>
      )}

      {/* ── Tabla ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: tab === 'trials' ? 920 : tab === 'billing' ? 980 : 720 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                {tab === 'billing' && (
                  <th style={{ ...th, width: 34, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedBilling.size > 0 && selectedBilling.size === filtered.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedBilling(new Set(filtered.map(w => w.id)))
                        else clearBillingSelection()
                      }}
                      title="Seleccionar todos"
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th style={th}>Workspace</th>
                {tab === 'trials' && <th style={{ ...th, textAlign: 'center' }}>Trial</th>}
                {tab === 'trials' && <th style={{ ...th, textAlign: 'center' }}>Actividad</th>}
                {tab === 'trials' && <th style={{ ...th, textAlign: 'center' }}>Últ. uso</th>}
                {tab === 'billing' && <th style={{ ...th, textAlign: 'center' }}>Cobro</th>}
                {tab === 'billing' && <th style={{ ...th, textAlign: 'center' }}>Próximo</th>}
                {tab === 'billing' && <th style={{ ...th, textAlign: 'right' }}>Revenue</th>}
                {tab !== 'billing' && <th style={th}>Plan</th>}
                {tab !== 'trials' && tab !== 'billing' && <th style={{ ...th, textAlign: 'center' }}>Seats</th>}
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={tab === 'billing' ? 9 : 8} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>
                  <i className="fa fa-spinner fa-spin" style={{ marginRight: 8 }} />
                  Cargando…
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={tab === 'billing' ? 9 : 8} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>
                  {tab === 'trials'  ? 'Sin trials por ahora — todo bajo control.' :
                   tab === 'billing' ? 'Sin cobros pendientes. ✓ Todo al día.' :
                   tab === 'paid'    ? 'Sin clientes pagos todavía.' :
                   'Sin workspaces.'}
                </td></tr>
              )}
              {!loading && filtered.map(w => {
                const isOpen = expanded === w.id
                const overLimit = w.seats_used > w.seats_allowed
                const ut = urgencyTone(w.trial.urgency)
                // Elegir mensaje WA según el estado REAL del workspace.
                // El billing pesa más que el trial (si ya es cliente, no le hablamos como prospect).
                const bStatus = w.billing?.status
                const bDays   = w.billing?.daysUntilDue
                const waKind =
                  bStatus === STATUS.PAUSED || bStatus === STATUS.CHURNED ? 'paused' :
                  bStatus === STATUS.PENDING_PAYMENT                       ? 'overdue' :
                  bStatus === STATUS.ACTIVE && bDays !== null && bDays <= 3 ? 'due_soon' :
                  bStatus === STATUS.ACTIVE                                 ? 'paid' :
                  w.trial.urgency === 'last' || w.trial.urgency === 'hot'  ? 'expiring' :
                  w.trial.urgency === 'expired'                            ? 'expired' :
                  w.plan !== 'solo'                                        ? 'paid' :
                  'trial'
                return (
                  <>
                    <tr key={w.id} className="trial-row" style={{ borderTop: '1px solid var(--border)', background: tab === 'billing' && selectedBilling.has(w.id) ? 'rgba(124,58,237,.06)' : undefined }}>
                      {tab === 'billing' && (
                        <td style={{ ...td, textAlign: 'center', width: 34 }}>
                          <input
                            type="checkbox"
                            checked={selectedBilling.has(w.id)}
                            onChange={() => toggleBillingSelection(w.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                      )}
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{w.name || 'Sin nombre'}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'monospace', marginTop: 2 }}>
                          {w.id.slice(0, 8)}… · creado {fmtDate(w.created_at)}
                        </div>
                      </td>
                      {tab === 'trials' && (
                        <>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span className="urgency-pill" style={{ background: ut.bg, color: ut.fg }}>
                              {w.trial.urgency === 'expired' ? <i className="fa fa-clock" /> :
                               w.trial.urgency === 'last'    ? <i className="fa fa-fire" /> :
                               <i className="fa fa-rocket" />}
                              {w.trial.label}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: w.temp.tone }}>
                              <span style={{ fontSize: 14 }}>{w.temp.icon}</span> {w.temp.label}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'center', fontSize: 11.5, color: 'var(--txt3)' }}>
                            {w.last_activity ? `${daysSince(w.last_activity)}d` : '—'}
                          </td>
                        </>
                      )}
                      {tab === 'billing' && (
                        <>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span className="urgency-pill" style={{ background: w.billing.tone.bg, color: w.billing.tone.fg }}>
                              {w.billing.urgency === 'paused'  ? <i className="fa fa-pause" /> :
                               w.billing.urgency === 'overdue' ? <i className="fa fa-fire" /> :
                               w.billing.urgency === 'hot'     ? <i className="fa fa-exclamation" /> :
                               w.billing.urgency === 'warm'    ? <i className="fa fa-hourglass-half" /> :
                               <i className="fa fa-check" />}
                              {w.billing.label}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'center', fontSize: 12, color: 'var(--txt2)' }}>
                            {w.next_payment_due_at ? fmtShortDate(w.next_payment_due_at) : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--txt)' }}>
                            {fmtMoney(Number(w.lifetime_revenue) || 0)}
                          </td>
                        </>
                      )}
                      {tab !== 'billing' && (
                        <td style={td}>
                          <select value={w.plan} onChange={e => changePlan(w.id, e.target.value)} style={sel}>
                            {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                        </td>
                      )}
                      {tab !== 'trials' && tab !== 'billing' && (
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input
                            type="number" min={0} value={w.seats_allowed}
                            onChange={e => setSeats(w.id, e.target.value)}
                            style={{ width: 60, padding: '4px 6px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--txt)' }}
                          />
                          <div style={{ fontSize: 11, color: overLimit ? '#DC2626' : 'var(--txt3)', marginTop: 2 }}>
                            usados: {w.seats_used}{overLimit ? ' ⚠' : ''}
                          </div>
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                          background: w.status === 'active' ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.12)',
                          color: w.status === 'active' ? '#16A34A' : '#DC2626',
                        }}>{w.status}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div className="trial-actions" style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {tab === 'billing' ? (
                            <>
                              <button onClick={() => generateMpLinkAndShare(w)} className="wa-btn" title="Generar link MP $30k y abrir WhatsApp">
                                <i className="fa-brands fa-whatsapp" /> Cobrar $30k
                              </button>
                              <button onClick={() => markAsPaid(w, 'monthly')} title="Registrar pago manual (transferencia / efectivo)">
                                <i className="fa fa-check" /> Marcar pagado
                              </button>
                              <button onClick={() => showPaymentHistory(w)} title="Ver historial de pagos">
                                <i className="fa fa-clock-rotate-left" /> Historial
                              </button>
                            </>
                          ) : (
                            <>
                              <a href={waLink(w.name, waKind, w.contact_phone)} target="_blank" rel="noopener noreferrer" className="wa-btn" title={`Mensaje ${waKind} pre-armado`}>
                                <i className="fa-brands fa-whatsapp" /> WhatsApp
                              </a>
                              <button onClick={() => setExpanded(isOpen ? null : w.id)} title="Ver miembros">
                                <i className={`fa fa-chevron-${isOpen ? 'up' : 'down'}`} /> Miembros
                              </button>
                              <button
                                onClick={() => generateMpLinkAndShare(w)}
                                title="Generar link MP de $30.000 (cuota mensual) y abrir WhatsApp con el mensaje"
                                style={{ color: '#009EE3', background: 'rgba(0,158,247,.08)', borderColor: 'rgba(0,158,247,.25)' }}
                              >
                                <i className="fa fa-link" /> $30k
                              </button>
                              <button
                                onClick={() => markAsPaid(w)}
                                title="Registrar pago manual (transferencia, efectivo, MP externo)"
                                style={{ color: '#16A34A', background: 'rgba(22,163,74,.08)', borderColor: 'rgba(22,163,74,.25)' }}
                              >
                                <i className="fa fa-dollar-sign" />
                              </button>
                              <button onClick={() => showPaymentHistory(w)} title="Ver historial de pagos de este workspace">
                                <i className="fa fa-clock-rotate-left" />
                              </button>
                              <button onClick={() => toggleStatus(w.id, w.status)} title={w.status === 'active' ? 'Pausar' : 'Activar'}>
                                <i className={`fa fa-${w.status === 'active' ? 'pause' : 'play'}`} />
                              </button>
                              <button onClick={() => deleteUserHard(w.id, w.name || 'usuario')} title="Eliminar usuario COMPLETAMENTE (auth.users + workspace + data)"
                                style={{ color: '#DC2626' }}>
                                <i className="fa fa-trash" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: 'var(--surface2)' }}>
                        <td colSpan={tab === 'trials' ? 7 : 5} style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                            Miembros ({(members[w.id] || []).length})
                          </div>
                          {(members[w.id] || []).length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Sin miembros invitados</div>
                          ) : (
                            <table style={{ width: '100%', fontSize: 12 }}>
                              <tbody>
                                {(members[w.id] || []).map(m => (
                                  <tr key={m.id}>
                                    <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{m.user_id.slice(0, 8)}…</td>
                                    <td style={{ padding: '4px 8px', fontWeight: 600 }}>{m.role}</td>
                                    <td style={{ padding: '4px 8px' }}>{m.status}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                      {m.role !== 'owner' && m.status !== 'revoked' && (
                                        <button onClick={() => revokeMember(m.id)} style={btnLink}>Revocar</button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Leyenda de temperatura/urgencia ─────────────────────────── */}
      {tab === 'trials' && filtered.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--txt2)' }}>Cómo leer:</strong>{' '}
          <span style={{ color: '#DC2626', fontWeight: 700 }}>HOY</span> vence ya ·{' '}
          <span style={{ color: '#DC2626' }}>1-3d</span> contactar urgente ·{' '}
          <span style={{ color: '#D97706' }}>4-5d</span> a tiempo ·{' '}
          🔥 caliente (cargó muchos datos, alta intención) · ❄️ frío (sin uso, probablemente abandone)
        </div>
      )}
      {tab === 'billing' && filtered.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--txt2)' }}>Acciones:</strong>{' '}
          <strong style={{ color: '#25D366' }}>Cobrar $30k</strong> genera link MP + abre WhatsApp con mensaje precargado ·{' '}
          <strong style={{ color: '#7C3AED' }}>Marcar pagado</strong> registra pago manual (transferencia/efectivo) ·{' '}
          <strong style={{ color: '#6B7280' }}>Historial</strong> muestra todos los pagos del workspace
        </div>
      )}

      {/* ═══ Modal: historial de pagos ═══ */}
      {paymentHistoryFor && (
        <div
          onClick={() => setPaymentHistoryFor(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(15,12,60,.6)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16,
              maxWidth: 720, width: '100%', maxHeight: '85vh',
              boxShadow: '0 25px 70px rgba(15,12,60,.3)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface2)',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>
                  <i className="fa fa-clock-rotate-left" style={{ marginRight: 8, color: '#7C3AED' }} />
                  Historial de pagos
                </h3>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                  {paymentHistoryFor.name} · Total acumulado: <strong style={{ color: 'var(--txt)' }}>{fmtMoney(Number(paymentHistoryFor.lifetime_revenue) || 0)}</strong>
                </div>
              </div>
              <button onClick={() => setPaymentHistoryFor(null)} aria-label="Cerrar" style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'transparent', border: 'none', color: 'var(--txt3)',
                cursor: 'pointer', fontSize: 14,
              }}>
                <i className="fa fa-xmark" />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 22px' }}>
              {paymentHistoryLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>
                  <i className="fa fa-spinner fa-spin" style={{ marginRight: 8 }} /> Cargando…
                </div>
              ) : paymentHistory.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>
                  <i className="fa fa-inbox" style={{ fontSize: 28, marginBottom: 8, opacity: .4, display: 'block' }} />
                  Sin pagos registrados todavía.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                      <th style={th}>Fecha</th>
                      <th style={th}>Concepto</th>
                      <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                      <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                      <th style={th}>Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map(p => {
                      const kindLabel = p.kind === 'onboarding' ? 'Pago de ingreso' : p.kind === 'monthly' ? 'Cuota mensual' : p.kind === 'manual' ? 'Pago manual' : p.kind
                      const statusOk = p.mp_status === 'approved' || p.mp_status === 'manual_confirmed'
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ ...td, fontSize: 12, color: 'var(--txt2)' }}>
                            {new Date(p.paid_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ ...td, fontWeight: 600 }}>
                            {kindLabel}
                            {p.notes && <div style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 400, marginTop: 2 }}>{p.notes}</div>}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#059669' }}>
                            {fmtMoney(Number(p.amount) || 0)}
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                              background: statusOk ? 'rgba(22,163,74,.12)' : 'rgba(217,119,6,.12)',
                              color: statusOk ? '#16A34A' : '#D97706',
                            }}>
                              {p.mp_status || 'pendiente'}
                            </span>
                          </td>
                          <td style={{ ...td, fontSize: 11.5, color: 'var(--txt3)' }}>
                            {p.mp_payment_method || (p.kind === 'manual' ? 'Manual' : '—')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Registrar pago manual ═══ */}
      {payModalFor && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget && !payLoading) setPayModalFor(null) }}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="mh">
              <h3><i className="fa fa-dollar-sign" style={{ color: '#16A34A', marginRight: 8 }} />Registrar pago manual</h3>
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                Workspace: <strong style={{ color: 'var(--txt)' }}>{payModalFor.name}</strong>
              </div>
            </div>

            {/* Radio de tipo */}
            <div style={{ padding: '14px 20px 0' }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)' }}>
                Tipo de pago
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                {[
                  { key: 'onboarding', lbl: 'Ingreso',    hint: '$120.000', ico: 'fa-rocket' },
                  { key: 'monthly',    lbl: 'Mensual',    hint: '$30.000',  ico: 'fa-calendar-days' },
                  { key: 'manual',     lbl: 'Otro monto', hint: 'personalizado', ico: 'fa-pen' },
                ].map(opt => {
                  const active = payForm.kind === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPayKind(opt.key)}
                      style={{
                        padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${active ? '#16A34A' : 'var(--border)'}`,
                        background: active ? 'rgba(22,163,74,.08)' : 'var(--surface)',
                        color: active ? '#065F46' : 'var(--txt2)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all .15s',
                      }}
                    >
                      <i className={`fa ${opt.ico}`} style={{ fontSize: 14 }} />
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.lbl}</div>
                      <div style={{ fontSize: 10, color: active ? '#059669' : 'var(--txt3)' }}>{opt.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Monto */}
            <div style={{ padding: '14px 20px 0' }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)' }}>
                Monto (ARS)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#16A34A' }}>$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={payForm.amount === '' ? '' : Number(payForm.amount).toLocaleString('es-AR')}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^\d]/g, '')
                    setPayForm(f => ({ ...f, amount: raw === '' ? '' : Number(raw) }))
                  }}
                  disabled={payForm.kind !== 'manual'}
                  style={{
                    flex: 1, fontSize: 18, fontWeight: 700, padding: '8px 12px',
                    border: '1.5px solid var(--border)', borderRadius: 8,
                    background: payForm.kind === 'manual' ? 'var(--surface)' : 'var(--surface2)',
                    color: 'var(--txt)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>
            </div>

            {/* Método */}
            <div style={{ padding: '14px 20px 0' }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)' }}>
                Método de pago
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
                {[
                  { key: 'transferencia', lbl: 'Transf.', ico: 'fa-building-columns' },
                  { key: 'efectivo',      lbl: 'Efectivo', ico: 'fa-money-bill-wave' },
                  { key: 'mp externo',    lbl: 'MP', ico: 'fa-credit-card' },
                  { key: 'otro',          lbl: 'Otro', ico: 'fa-ellipsis' },
                ].map(opt => {
                  const active = payForm.method === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPayForm(f => ({ ...f, method: opt.key }))}
                      style={{
                        padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                        background: active ? 'rgba(225,29,116,.08)' : 'var(--surface)',
                        color: active ? 'var(--brand)' : 'var(--txt2)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        fontSize: 11,
                      }}
                    >
                      <i className={`fa ${opt.ico}`} style={{ fontSize: 12 }} />
                      <span style={{ fontWeight: 600 }}>{opt.lbl}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notas */}
            <div style={{ padding: '14px 20px 0' }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)' }}>
                Notas (opcional)
              </label>
              <textarea
                value={payForm.notes}
                onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Ej: transferencia recibida el 5/07, comprobante #123"
                rows={2}
                style={{
                  width: '100%', marginTop: 6, padding: '8px 12px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', color: 'var(--txt)', resize: 'vertical',
                  background: 'var(--surface)',
                }}
              />
            </div>

            {/* Info visual + botones */}
            <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.4, padding: '8px 12px', background: 'rgba(22,163,74,.05)', borderRadius: 8, border: '1px solid rgba(22,163,74,.15)' }}>
                <i className="fa fa-circle-info" style={{ marginRight: 6, color: '#16A34A' }} />
                Se va a sumar a <strong>lifetime_revenue</strong>, adelantar <strong>next_payment_due_at</strong> +30 días y enviarte un mail de confirmación.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setPayModalFor(null)}
                  disabled={payLoading}
                >
                  Cancelar
                </button>
                <button
                  className="btn"
                  onClick={submitManualPayment}
                  disabled={payLoading || !payForm.amount || Number(payForm.amount) <= 0}
                  style={{ background: '#16A34A', color: '#fff', border: 'none' }}
                >
                  {payLoading
                    ? <><i className="fa fa-spinner fa-spin" style={{ marginRight: 6 }} />Registrando…</>
                    : <><i className="fa fa-check" style={{ marginRight: 6 }} />Registrar {fmtMoney(Number(payForm.amount) || 0)}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Crear usuario manual ═══ */}
      {showCreateUser && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setShowCreateUser(false) }}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="mh">
              <h3><i className="fa fa-user-plus" style={{ color: 'var(--brand)', marginRight: 8 }} />Crear usuario manual</h3>
              <button className="mclose" onClick={() => setShowCreateUser(false)}><i className="fa fa-xmark" /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--txt3)', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              Creás directamente la cuenta con email + contraseña. El usuario se loguea YA con esas credenciales (sin necesidad de Google).
            </p>
            <div className="fg" style={{ marginBottom: 12 }}>
              <label>Email del cliente *</label>
              <input type="email" value={newUserForm.email}
                onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="cliente@email.com" />
            </div>
            <div className="fg" style={{ marginBottom: 12 }}>
              <label>Contraseña inicial * (mín. 6 caracteres)</label>
              <input type="text" value={newUserForm.password}
                onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                placeholder="Una contraseña que le vas a pasar al cliente" />
            </div>
            <div className="fg" style={{ marginBottom: 12 }}>
              <label>Nombre de la empresa (opcional)</label>
              <input type="text" value={newUserForm.business_name}
                onChange={e => setNewUserForm({ ...newUserForm, business_name: e.target.value })}
                placeholder="Distribuidora del Sur" />
            </div>
            <div className="fg" style={{ marginBottom: 16 }}>
              <label>Nombre del contacto (opcional)</label>
              <input type="text" value={newUserForm.full_name}
                onChange={e => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                placeholder="María Pérez" />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateUser(false)} style={{ flex: 1 }} disabled={creatingUser}>
                <i className="fa fa-xmark" /> Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleCreateUser} style={{ flex: 1 }} disabled={creatingUser}>
                {creatingUser
                  ? <><i className="fa fa-spinner fa-spin" /> Creando...</>
                  : <><i className="fa fa-check" /> Crear y activar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th = { padding: '10px 12px', fontWeight: 700, fontSize: 11, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }
const td = { padding: '10px 12px', verticalAlign: 'middle' }
const sel = { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--txt)', fontSize: 12 }
const btnLink = { background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }
