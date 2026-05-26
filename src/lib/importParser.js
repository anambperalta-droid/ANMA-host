/**
 * ANMA — Import Parser v1
 * ───────────────────────
 * Parsea texto plano (CSV o Excel pegado) en filas estructuradas
 * listas para importar a localStorage / Supabase.
 *
 * CARACTERÍSTICAS:
 *   · Auto-detecta separador (tab, punto y coma, coma)
 *   · Mapea headers en español/inglés a campos internos
 *   · Sanitiza números: maneja formatos AR (1.234,56) y US (1,234.56)
 *   · Modo sin-headers: fallback por posición de columna
 *   · Marca filas como valid / duplicate / empty
 */

// ── Normalización ────────────────────────────────────────────────────

/** Normaliza un string para comparaciones: lowercase, trim, espacios simples */
export function normStr(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Sanitiza un valor numérico desde string con formato AR/US.
 * Elimina símbolos de moneda, espacios. Maneja:
 *   "1.234,56" → 1234.56 (AR)
 *   "1,234.56" → 1234.56 (US)
 *   "1.234"    → 1234    (miles AR sin decimal)
 *   "1,5"      → 1.5     (decimal con coma)
 */
export function sanitizeNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  let s = String(v).replace(/\s/g, '').replace(/[$€£%]/g, '').trim()
  if (!s) return 0

  const lastDot   = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')

  if (lastDot > -1 && lastComma > -1) {
    if (lastComma > lastDot) {
      // Formato AR: 1.234,56 → 1234.56
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Formato US: 1,234.56 → 1234.56
      s = s.replace(/,/g, '')
    }
  } else if (lastComma > -1) {
    const parts = s.split(',')
    // Coma decimal si parte derecha tiene 1-2 dígitos y parte izquierda ≤ 3 dígitos
    if (parts.length === 2 && parts[1].length <= 2 && parts[0].replace(/\D/g,'').length <= 3) {
      s = s.replace(',', '.')
    } else {
      // Miles con coma: 1,234,567 → quitar comas
      s = s.replace(/,/g, '')
    }
  } else if (lastDot > -1) {
    // Punto podría ser miles AR si > 3 dígitos después: 1.234 → 1234
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      s = s.replace('.', '')
    }
    // else: punto decimal normal, no cambiar
  }

  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// ── Detección de separador ───────────────────────────────────────────

function detectSep(line) {
  if (line.includes('\t')) return '\t'
  const semis  = (line.match(/;/g)  || []).length
  const commas = (line.match(/,/g)  || []).length
  return semis > commas ? ';' : ','
}

// ── Parser de línea CSV (respeta comillas) ───────────────────────────

function parseLine(line, sep) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === sep && !inQ) {
      result.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur.trim())
  return result
}

// ── Mapeo de headers ─────────────────────────────────────────────────

const HEADER_MAPS = {
  clientes: [
    { variants: ['empresa', 'company', 'company_name', 'razón social', 'razon social', 'organización', 'organizacion', 'org'], key: 'company' },
    { variants: ['contacto', 'contact', 'nombre', 'name', 'responsable'], key: 'contact' },
    { variants: ['wa', 'whatsapp', 'tel', 'teléfono', 'telefono', 'phone', 'celular', 'móvil', 'movil', 'fono'], key: 'wa' },
    { variants: ['email', 'correo', 'mail', 'e-mail'], key: 'email' },
    { variants: ['rubro', 'sector', 'industria', 'tipo', 'categoría', 'categoria', 'giro'], key: 'rubro' },
    { variants: ['notas', 'nota', 'notes', 'observaciones', 'comentarios', 'obs'], key: 'notes' },
    { variants: ['descuento', 'discount', 'dto', 'desc'], key: 'discount' },
    { variants: ['cuit', 'cuit/cuil', 'cuil', 'rut', 'rfc'], key: 'cuit' },
  ],
  proveedores: [
    { variants: ['proveedor', 'supplier', 'nombre', 'name', 'empresa', 'company', 'razón social', 'razon social'], key: 'name' },
    { variants: ['contacto', 'contact', 'responsable', 'representante'], key: 'contact' },
    { variants: ['wa', 'whatsapp', 'tel', 'teléfono', 'telefono', 'phone', 'celular', 'móvil', 'movil'], key: 'wa' },
    { variants: ['rubro', 'sector', 'categoría', 'categoria', 'tipo', 'industria'], key: 'rubro' },
    { variants: ['email', 'correo', 'mail', 'e-mail'], key: 'email' },
    { variants: ['notas', 'nota', 'notes', 'observaciones'], key: 'notes' },
    { variants: ['cuit', 'cuit/cuil', 'cuil', 'rut'], key: 'cuit' },
  ],
  productos: [
    { variants: ['nombre', 'name', 'producto', 'product', 'descripción', 'descripcion', 'artículo', 'articulo', 'item'], key: 'name' },
    { variants: ['categoría', 'categoria', 'cat', 'category', 'tipo', 'línea', 'linea'], key: 'cat' },
    { variants: ['costo', 'cost', 'precio costo', 'costo unitario', 'costo base', 'precio de costo'], key: 'cost' },
    { variants: ['precio b2c', 'precio público', 'precio publico', 'precio venta', 'precio minorista', 'priceb2c', 'pvp', 'precio al público', 'precio al publico'], key: 'priceB2C' },
    { variants: ['precio b2b', 'precio mayorista', 'precio empresa', 'priceb2b', 'precio por mayor'], key: 'priceB2B' },
    { variants: ['stock', 'existencias', 'cantidad', 'qty', 'disponible'], key: 'stock' },
    { variants: ['stock mín', 'stock min', 'stock mínimo', 'stockmin', 'mínimo', 'minimo', 'punto de reorden'], key: 'minStock' },
    { variants: ['proveedor', 'supplier', 'marca', 'brand', 'fabricante'], key: 'supplierName' },
    { variants: ['sku', 'código', 'codigo', 'code', 'ref', 'referencia', 'cod', 'barcode'], key: 'sku' },
    { variants: ['unidad', 'unit', 'um', 'u.m.', 'udm', 'u/m'], key: 'unit' },
    { variants: ['notas', 'nota', 'notes', 'observaciones'], key: 'notes' },
  ],
  insumos: [
    { variants: ['nombre', 'name', 'insumo', 'material', 'descripción', 'descripcion', 'artículo', 'articulo'], key: 'name' },
    { variants: ['categoría', 'categoria', 'cat', 'category', 'tipo'], key: 'cat' },
    { variants: ['subcategoría', 'subcategoria', 'subcat', 'sub-categoría', 'sub-categoria'], key: 'subcat' },
    { variants: ['costo', 'cost', 'precio costo', 'costo unitario', 'precio'], key: 'cost' },
    { variants: ['stock', 'existencias', 'cantidad', 'qty', 'disponible'], key: 'stock' },
    { variants: ['stock mín', 'stock min', 'stock mínimo', 'stockmin', 'mínimo', 'minimo'], key: 'minStock' },
    { variants: ['proveedor', 'supplier', 'marca', 'fabricante'], key: 'supplierName' },
    { variants: ['unidad', 'unit', 'um', 'u.m.', 'udm'], key: 'unit' },
    { variants: ['notas', 'nota', 'notes', 'observaciones'], key: 'notes' },
  ],
}

function matchHeader(headerRaw, tipo) {
  const h = normStr(headerRaw)
  for (const mapping of (HEADER_MAPS[tipo] || [])) {
    if (mapping.variants.some(v => h === v || h.startsWith(v + ' '))) return mapping.key
  }
  return null
}

// ── Auto-detección de tipo de entidad ────────────────────────────────

/**
 * Intenta adivinar el tipo de entidad a partir de los headers.
 * Devuelve 'clientes' | 'proveedores' | 'productos' | 'insumos' | null
 */
export function detectTipo(headers) {
  const hs = headers.map(h => normStr(h))
  const has = (terms) => terms.some(t => hs.some(h => h === t || h.includes(t)))
  const lacks = (terms) => !terms.some(t => hs.some(h => h === t || h.includes(t)))

  // Presencia fuerte de "empresa" sin precios → clientes
  if (has(['empresa', 'company_name', 'company']) && lacks(['costo', 'cost', 'precio', 'price'])) {
    return 'clientes'
  }
  // "proveedor" o "supplier" explícito en headers → proveedores
  if (has(['proveedor', 'supplier']) && lacks(['costo', 'cost'])) return 'proveedores'
  // "insumo" o "subcat" → insumos
  if (has(['insumo', 'material']) || has(['subcat', 'subcategoría', 'subcategoria'])) return 'insumos'
  // Precios B2C explícitos → productos
  if (has(['precio b2c', 'precio público', 'precio publico', 'pvp', 'priceb2c'])) return 'productos'
  // Solo costo sin B2C → insumos (más probable)
  if (has(['costo', 'cost'])) return 'insumos'
  // Fallback si hay "nombre" o "name" con "email" o "wa" → clientes/proveedores
  if (has(['email', 'mail', 'wa', 'whatsapp'])) return 'clientes'
  return null
}

// ── Campos numéricos por tipo ─────────────────────────────────────────

const NUM_KEYS = {
  clientes:    new Set(['discount']),
  proveedores: new Set([]),
  productos:   new Set(['cost', 'priceB2C', 'priceB2B', 'stock', 'minStock']),
  insumos:     new Set(['cost', 'stock', 'minStock']),
}

// ── Fallback por posición (cuando no hay headers reconocibles) ────────

const POS_MAPS = {
  clientes:    ['company', 'contact', 'wa', 'email', 'rubro', 'notes'],
  proveedores: ['name', 'contact', 'wa', 'rubro', 'email', 'notes'],
  productos:   ['name', 'cat', 'cost', 'priceB2C', 'priceB2B', 'stock', 'minStock', 'sku'],
  insumos:     ['name', 'cat', 'cost', 'stock', 'minStock', 'unit', 'supplierName'],
}

// ── Función principal ─────────────────────────────────────────────────

/**
 * Parsea texto pegado (CSV / TSV / Excel) para un tipo de entidad.
 *
 * @param {string} rawText  Texto crudo del portapapeles o archivo
 * @param {string} tipo     'clientes' | 'proveedores' | 'productos' | 'insumos'
 * @returns {{
 *   filas:           Array<object>,   // filas con campos + _row + _status
 *   columnas:        string[],        // headers originales detectados
 *   mapeoColumnas:   object,          // índice → key mapeada
 *   tipoDetectado:   string|null,     // tipo auto-detectado desde headers
 *   sinHeaders:      boolean,
 * }}
 */
export function parseText(rawText, tipo) {
  const lines = (rawText || '')
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l.trim())

  if (!lines.length) {
    return { filas: [], columnas: [], mapeoColumnas: {}, tipoDetectado: null, sinHeaders: false }
  }

  const sep         = detectSep(lines[0])
  const rawHeaders  = parseLine(lines[0], sep)
  const columnas    = rawHeaders.map(h => h.trim())

  // Mapear índice → key de campo
  const mapeoColumnas = {}
  columnas.forEach((h, i) => {
    const key = matchHeader(h, tipo)
    if (key) mapeoColumnas[i] = key
  })

  const tipoDetectado = detectTipo(columnas)
  const hasHeaders    = Object.keys(mapeoColumnas).length > 0
  const dataStart     = hasHeaders ? 1 : 0
  const numKeys       = NUM_KEYS[tipo] || new Set()
  const filas         = []

  for (let li = dataStart; li < lines.length; li++) {
    const vals = parseLine(lines[li], sep)
    if (vals.every(v => !v.trim())) continue   // fila completamente vacía

    const fila = { _row: li + 1, _raw: lines[li], _status: 'valid' }

    if (hasHeaders) {
      Object.entries(mapeoColumnas).forEach(([idx, key]) => {
        const v = vals[Number(idx)] || ''
        fila[key] = numKeys.has(key) ? sanitizeNum(v) : v.trim()
      })
    } else {
      // Sin headers: mapeo posicional
      ;(POS_MAPS[tipo] || []).forEach((key, i) => {
        const v = vals[i] || ''
        fila[key] = numKeys.has(key) ? sanitizeNum(v) : v.trim()
      })
    }

    // Determinar estado inicial de la fila
    const nameKey = tipo === 'clientes' ? 'company' : 'name'
    if (!fila[nameKey]?.trim()) {
      fila._status = 'empty'
    }

    filas.push(fila)
  }

  return { filas, columnas, mapeoColumnas, tipoDetectado, sinHeaders: !hasHeaders }
}

/**
 * Marca filas como 'duplicate' si ya existe un registro con el mismo nombre
 * en la lista existente del usuario. No modifica filas 'empty'.
 *
 * @param {Array}  filas         Resultado de parseText
 * @param {Array}  existingList  Lista actual de localStorage (clients / suppliers / products / insumos)
 * @param {string} nameKey       Campo de nombre: 'company' para clientes, 'name' para el resto
 * @returns {Array} Nueva lista de filas con _status actualizado
 */
export function markDuplicates(filas, existingList, nameKey) {
  const existing = new Set((existingList || []).map(x => normStr(x[nameKey] || '')).filter(Boolean))
  return filas.map(fila => {
    if (fila._status !== 'valid') return fila
    const name = normStr(fila[nameKey] || '')
    if (!name) return { ...fila, _status: 'empty' }
    return { ...fila, _status: existing.has(name) ? 'duplicate' : 'valid' }
  })
}
