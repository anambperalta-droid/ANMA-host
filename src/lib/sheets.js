/* ─────────────────────────────────────────────
 * Google Sheets Sync — via Apps Script Web App
 * ─────────────────────────────────────────────
 * Cómo funciona:
 * 1) El usuario crea un Google Sheet nuevo
 * 2) Extensiones → Apps Script → pega el código de APPS_SCRIPT_TEMPLATE
 * 3) Implementar → Nueva implementación → Web App → "Cualquier usuario"
 * 4) Copia la URL /exec y la pega en Config > Integraciones
 * 5) ANMA envía un POST fire-and-forget por cada presupuesto guardado
 */

const LS_KEY = 'anma3_sheets_cfg'

export const getSheetsConfig = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { enabled: false, url: '', autoSync: true, lastSync: null, lastStatus: null } }
  catch { return { enabled: false, url: '', autoSync: true, lastSync: null, lastStatus: null } }
}
export const setSheetsConfig = (patch) => {
  const cur = getSheetsConfig()
  const next = { ...cur, ...patch }
  localStorage.setItem(LS_KEY, JSON.stringify(next))
  return next
}

/* ── Serializa un presupuesto en un row flat ── */
export const budgetToRow = (b) => ({
  id: b.id,
  num: b.num || '',
  date: b.date || '',
  contact: b.contact || '',
  company: b.company || '',
  wa: b.wa || '',
  ocasion: b.ocasion || '',
  clientType: b.clientType || '',
  delivery: b.delivery || '',
  deliveryDate: b.deliveryDate || '',
  status: b.status || '',
  payStatus: b.payStatus || '',
  itemsCount: (b.items || []).length,
  itemsSummary: (b.items || []).map(i => `${i.qty}x ${i.name}`).join(' | '),
  totalCost: b.totalCost || 0,
  totalGain: b.totalGain || 0,
  total: b.total || 0,
  depositAmt: b.depositAmt || 0,
  margin: b.margin || 0,
  deposit: b.deposit || 0,
  marginBudgeted: b.marginBudgeted || null,
  shipCost: b.shipCost || 0,
  noteInt: b.noteInt || '',
  noteCli: b.noteCli || '',
  updatedAt: new Date().toISOString(),
})

/* ── Push (auto-sync on save) ── */
export const pushBudget = async (b) => {
  const cfg = getSheetsConfig()
  if (!cfg.enabled || !cfg.url) return { ok: false, skipped: true }
  try {
    // Apps Script Web Apps no aceptan CORS con Content-Type JSON → usar text/plain
    await fetch(cfg.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'upsertBudget', row: budgetToRow(b) }),
    })
    // no-cors → respuesta opaca, asumimos éxito si no hay excepción
    setSheetsConfig({ lastSync: new Date().toISOString(), lastStatus: 'ok' })
    return { ok: true }
  } catch (err) {
    setSheetsConfig({ lastSync: new Date().toISOString(), lastStatus: 'error' })
    return { ok: false, message: err.message }
  }
}

/* ── Push en lote (backfill) ── */
export const pushAllBudgets = async (budgets) => {
  const cfg = getSheetsConfig()
  if (!cfg.enabled || !cfg.url) return { ok: false, message: 'Sincronización no configurada' }
  try {
    await fetch(cfg.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'bulkUpsert', rows: budgets.map(budgetToRow) }),
    })
    setSheetsConfig({ lastSync: new Date().toISOString(), lastStatus: 'ok' })
    return { ok: true, count: budgets.length }
  } catch (err) {
    setSheetsConfig({ lastSync: new Date().toISOString(), lastStatus: 'error' })
    return { ok: false, message: err.message }
  }
}

/* ── Test de conexión (GET con modo opaco) ── */
export const testSheetsConnection = async (url) => {
  if (!url) return { ok: false, message: 'URL vacía' }
  if (!url.includes('script.google.com')) return { ok: false, message: 'La URL debe ser de script.google.com' }
  if (!url.endsWith('/exec')) return { ok: false, message: 'La URL debe terminar en /exec' }
  try {
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }) })
    return { ok: true, message: 'Solicitud enviada correctamente. Verificá en tu Sheet que aparezca la fila de prueba.' }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

/* ── Plantilla de Google Apps Script ── */
export const APPS_SCRIPT_TEMPLATE = `/**
 * ANMA → Google Sheets sync endpoint
 * Pegá este código en: Extensiones → Apps Script
 * Luego: Implementar → Nueva implementación → Web app → Ejecutar como "Yo" → Acceso "Cualquier usuario"
 */
const SHEET_NAME = 'Presupuestos';
const HEADERS = ['id','num','fecha','contacto','empresa','whatsapp','ocasion','tipo','modalidad','fecha_entrega','estado','pago','items','productos','costo','ganancia','total','sena','margen_pct','sena_pct','margen_presupuestado','envio','nota_interna','nota_cliente','actualizado'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sh = getOrCreateSheet_();
    if (data.action === 'ping') { sh.appendRow(['PING', new Date()]); return json_({ok:true}); }
    if (data.action === 'upsertBudget') { upsert_(sh, data.row); return json_({ok:true}); }
    if (data.action === 'bulkUpsert') { (data.rows||[]).forEach(r => upsert_(sh, r)); return json_({ok:true, count:data.rows.length}); }
    return json_({ok:false, error:'unknown action'});
  } catch (err) { return json_({ok:false, error:err.toString()}); }
}

function doGet() {
  const sh = getOrCreateSheet_();
  const rows = sh.getDataRange().getValues();
  return json_({ok:true, rows});
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); sh.getRange(1,1,1,HEADERS.length).setFontWeight('bold').setBackground('#7C3AED').setFontColor('#ffffff'); sh.setFrozenRows(1); }
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.getRange(1,1,1,HEADERS.length).setFontWeight('bold').setBackground('#7C3AED').setFontColor('#ffffff'); sh.setFrozenRows(1); }
  return sh;
}

function upsert_(sh, r) {
  const row = [r.id,r.num,r.date,r.contact,r.company,r.wa,r.ocasion||'',r.clientType,r.delivery,r.deliveryDate,r.status,r.payStatus,r.itemsCount,r.itemsSummary,r.totalCost,r.totalGain,r.total,r.depositAmt,r.margin,r.deposit,r.marginBudgeted,r.shipCost,r.noteInt,r.noteCli,r.updatedAt];
  const data = sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),1).getValues();
  const idx = data.findIndex(x => String(x[0]) === String(r.id));
  if (idx >= 0) { sh.getRange(idx+2,1,1,row.length).setValues([row]); }
  else { sh.appendRow(row); }
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
`
