/**
 * ANMA Regalos — Utilidad de Migración Bulk Load v1
 * ─────────────────────────────────────────────────
 * Lee datos de localStorage (clientes, proveedores, productos)
 * y los carga en las tablas normalizadas de Supabase usando upsert
 * idempotente por (workspace_id, external_id).
 *
 * TABLAS DESTINO:
 *   · pro_suppliers    — tabla COMPARTIDA con ANMA Pro
 *   · regalos_clients  — clientes corporativos de Regalos
 *   · regalos_products — catálogo de productos de Regalos
 *
 * NOTA: pro_suppliers es compartida entre ambas apps bajo el mismo
 * workspace. Si el usuario ya migró desde ANMA Pro, los proveedores
 * ya existen y este upsert los actualiza sin duplicar.
 *
 * USO TÍPICO (desde consola del navegador o botón en Config):
 *   import { migrarTodo } from './lib/migracion'
 *   const resumen = await migrarTodo()
 *   console.table(resumen)
 *
 * GARANTÍAS:
 *   · Idempotente: ejecutar N veces da el mismo resultado (upsert).
 *   · No destruye datos existentes: ON CONFLICT actualiza el registro.
 *   · Imágenes base64 se descartan (no se almacenan en columnas texto).
 *   · Proveedores se migran primero; sus UUIDs se usan en productos.
 *   · Errores parciales no abortan la migración; se reportan en el resumen.
 *
 * SEGURIDAD:
 *   · Nunca almacena ni expone tokens de Supabase.
 *   · Usa el cliente ya autenticado de supabase.js.
 *   · Respeta RLS — solo inserta en el workspace del usuario activo.
 */

import { supabase } from './supabase'
import { db }        from './storage'
import { getSyncContext } from './sync'

// ── Constantes ──────────────────────────────────────────────────────
const BATCH = 50   // filas por request de upsert

// ── Helpers ─────────────────────────────────────────────────────────

/** Divide un array en chunks de tamaño n */
function chunks(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** Convierte un valor a número; devuelve 0 si NaN */
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }

/** Devuelve null si la imagen es base64; preserva URLs reales */
const sanitizeImage = (v) =>
  typeof v === 'string' && v.startsWith('data:') ? null : (v || null)

/**
 * Upserta filas en lotes de BATCH.
 * Devuelve { insertadas, errores[] }.
 */
async function batchUpsert(table, rows, conflictCols) {
  let insertadas = 0
  const errores = []

  for (const batch of chunks(rows, BATCH)) {
    const { error, count } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictCols, count: 'exact' })

    if (error) {
      errores.push({ batch: batch.map(r => r.external_id), mensaje: error.message })
    } else {
      insertadas += count ?? batch.length
    }
  }

  return { insertadas, errores }
}

// ── Lectura de localStorage ──────────────────────────────────────────

/**
 * Lee todos los datos locales relevantes para la migración.
 * Devuelve { clients, suppliers, products }.
 */
export function leerDatosLocales() {
  return {
    clients:   db('clients',   []),
    suppliers: db('suppliers', []),
    products:  db('products',  []),
  }
}

// ── Migradores individuales ──────────────────────────────────────────

/**
 * Migra proveedores → pro_suppliers (tabla compartida con ANMA Pro).
 * Devuelve { resultado, mapaProveedores: Map<externalId, uuid> }.
 *
 * mapaProveedores se usa para resolver supplierId en regalos_products.
 * Si ANMA Pro ya migró sus proveedores, este upsert los actualiza
 * (no duplica) gracias al índice UNIQUE (workspace_id, external_id).
 */
export async function migrarProveedores(wsId, suppliers) {
  const mapaProveedores = new Map()

  if (!suppliers?.length) {
    return { resultado: { tabla: 'pro_suppliers', total: 0, insertadas: 0, errores: [] }, mapaProveedores }
  }

  const rows = suppliers.map(s => ({
    workspace_id: wsId,
    external_id:  s.id,
    name:         (s.name || '').trim() || '(sin nombre)',
    contact_name: s.contact || null,
    phone:        s.wa || s.telefono || null,
    email:        s.email || null,
    notes:        s.notes || null,
    is_active:    true,
    extra: {
      rubro:        s.rubro        || null,
      cuit:         s.cuit         || null,
      ivaCondition: s.ivaCondition || null,
      paymentTerm:  s.paymentTerm  || null,
      cbu:          s.cbu          || null,
      leadTime:     s.leadTime     || null,
    },
  }))

  const resultado = await batchUpsert('pro_suppliers', rows, 'workspace_id,external_id')

  // Construir mapa externalId → uuid para uso posterior
  if (!resultado.errores.length || resultado.insertadas > 0) {
    const { data } = await supabase
      .from('pro_suppliers')
      .select('id, external_id')
      .eq('workspace_id', wsId)
      .not('external_id', 'is', null)

    ;(data || []).forEach(r => mapaProveedores.set(r.external_id, r.id))
  }

  return {
    resultado: { tabla: 'pro_suppliers', total: rows.length, ...resultado },
    mapaProveedores,
  }
}

/**
 * Migra clientes → regalos_clients.
 * En Regalos los clientes son empresas (B2B corporativo).
 * company_name es NOT NULL: empresa > contacto > fallback.
 */
export async function migrarClientes(wsId, clients) {
  if (!clients?.length) {
    return { tabla: 'regalos_clients', total: 0, insertadas: 0, errores: [] }
  }

  const rows = clients.map(c => ({
    workspace_id: wsId,
    external_id:  c.id,
    company_name: (c.company || c.contact || '(sin nombre)').trim(),
    contact_name: c.contact  || null,
    email:        c.email    || null,
    phone:        c.wa       || null,
    notes:        c.notes    || null,
    is_active:    true,
    extra: {
      rubro:        c.rubro        || null,
      discount:     c.discount     || null,
      cuit:         c.cuit         || null,
      razonSocial:  c.razonSocial  || null,
      ivaCondition: c.ivaCondition || null,
    },
  }))

  const resultado = await batchUpsert('regalos_clients', rows, 'workspace_id,external_id')
  return { tabla: 'regalos_clients', total: rows.length, ...resultado }
}

/**
 * Migra productos del catálogo → regalos_products.
 * Requiere mapaProveedores para resolver supplierId → uuid.
 * Imágenes base64 se descartan (image_url = null).
 */
export async function migrarProductos(wsId, products, mapaProveedores) {
  if (!products?.length) {
    return { tabla: 'regalos_products', total: 0, insertadas: 0, errores: [] }
  }

  const rows = products.map(p => ({
    workspace_id: wsId,
    external_id:  p.id,
    name:         (p.name || '').trim() || '(sin nombre)',
    category:     p.cat   || null,
    unit:         p.unit  || 'un',
    cost:         num(p.cost),
    price:        num(p.price) || null,
    notes:        p.notes || null,
    image_url:    sanitizeImage(p.image),   // base64 → null
    supplier_id:  mapaProveedores.get(Number(p.supplierId)) || null,
    is_active:    true,
    extra: {},
  }))

  const resultado = await batchUpsert('regalos_products', rows, 'workspace_id,external_id')
  return { tabla: 'regalos_products', total: rows.length, ...resultado }
}

// ── Migración completa ───────────────────────────────────────────────

/**
 * Ejecuta la migración completa en orden correcto:
 *   1. Proveedores → pro_suppliers (para obtener mapaProveedores)
 *   2. Clientes    → regalos_clients
 *   3. Productos   → regalos_products (usa mapaProveedores)
 *
 * @param {function} [onProgress] - Callback opcional: onProgress(paso, total)
 * @returns {Promise<Array>} Resumen de cada tabla migrada
 *
 * EJEMPLO:
 *   const resumen = await migrarTodo((paso, total) => console.log(`${paso}/${total}`))
 *   console.table(resumen)
 */
export async function migrarTodo(onProgress) {
  const { workspaceId: wsId } = getSyncContext()
  if (!wsId) throw new Error('[migracion] Usuario no autenticado — iniciá sesión primero.')

  const datos = leerDatosLocales()
  const resumen = []
  const pasos = 3

  // ── Paso 1: Proveedores ──────────────────────────────────────────
  onProgress?.(1, pasos)
  const { resultado: resProveedores, mapaProveedores } = await migrarProveedores(wsId, datos.suppliers)
  resumen.push(resProveedores)

  // ── Paso 2: Clientes ─────────────────────────────────────────────
  onProgress?.(2, pasos)
  resumen.push(await migrarClientes(wsId, datos.clients))

  // ── Paso 3: Productos ─────────────────────────────────────────────
  onProgress?.(3, pasos)
  resumen.push(await migrarProductos(wsId, datos.products, mapaProveedores))

  onProgress?.(pasos, pasos)

  // Calcular totales globales
  const totalRegistros  = resumen.reduce((s, r) => s + r.total,     0)
  const totalInsertados = resumen.reduce((s, r) => s + r.insertadas, 0)
  const totalErrores    = resumen.reduce((s, r) => s + r.errores.length, 0)

  console.log(
    `[migracion] Migración completada — ${totalInsertados}/${totalRegistros} registros`,
    totalErrores ? `⚠️ ${totalErrores} errores` : '✓ sin errores'
  )

  return resumen
}
