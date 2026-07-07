import { useState, useEffect } from 'react'

/**
 * ANMA Regalos — MoneyInput
 * ─────────────────────────
 * Input de dinero pensado para gente que viene de Excel.
 * Acepta cualquier formato razonable:
 *   "10000"     → 10000
 *   "10.000"    → 10000  (miles AR)
 *   "10,000"    → 10000  (miles US)
 *   "$8.500"    → 8500
 *   "$ 1.234,56"→ 1234.56
 *   "1.5k"      → 1500   (shortcut k)
 *   "2.5m"      → 2500000 (shortcut M)
 *
 * Formatea visualmente mientras escribís (10000 → "10.000") sin frenar
 * el tipeo. En mobile abre teclado numérico. El valor devuelto es siempre
 * un Number listo para persistir.
 *
 * Uso:
 *   <MoneyInput value={form.cost} onChange={v => setF('cost', v)} placeholder="0" />
 *
 * Props:
 *   value           — número (o '' cuando está vacío)
 *   onChange(num)   — recibe el número parseado
 *   placeholder     — texto placeholder
 *   allowEmpty      — si true, permite vacío (devuelve '' en vez de 0). Default false.
 *   min             — mínimo permitido (default 0)
 *   style, ...rest  — pasan al <input>
 */

// Parser tolerante de dinero: acepta AR/US/símbolos/k/m/negativos
export function parseMoney(input) {
  if (input == null || input === '') return null
  if (typeof input === 'number') return isNaN(input) ? null : input
  let s = String(input).trim()
  if (!s) return null

  // Detecta k/m como sufijo (case-insensitive)
  let mult = 1
  const lower = s.toLowerCase()
  if (/[km]$/.test(lower)) {
    const suf = lower.slice(-1)
    if (suf === 'k') mult = 1_000
    else if (suf === 'm') mult = 1_000_000
    s = s.slice(0, -1).trim()
  }

  // Sacamos símbolos comunes de moneda y espacios
  s = s.replace(/[$€£¥\s]/g, '')
  if (!s || s === '-') return null

  const lastDot   = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')

  if (lastDot > -1 && lastComma > -1) {
    // Ambos: el último de los dos es el decimal
    if (lastComma > lastDot) {
      // Formato AR: 1.234,56 → 1234.56
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Formato US: 1,234.56 → 1234.56
      s = s.replace(/,/g, '')
    }
  } else if (lastComma > -1) {
    const parts = s.split(',')
    // Coma decimal si la parte derecha tiene 1-2 dígitos
    if (parts.length === 2 && parts[1].length <= 2 && parts[0].replace(/\D/g,'').length <= 3) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastDot > -1) {
    // Punto podría ser miles AR: 1.234 → 1234
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      s = s.replace('.', '')
    }
    // Si son múltiples puntos (ej: "1.234.567"), tratarlos todos como miles
    if (parts.length > 2) s = s.replace(/\./g, '')
  }

  const n = parseFloat(s)
  if (isNaN(n)) return null
  return n * mult
}

// Formatea un número para mostrar mientras se tipea (usa formato es-AR).
function formatDisplay(n) {
  if (n == null || n === '' || isNaN(n)) return ''
  const num = Number(n)
  // Sin decimales si es entero, con máximo 2 si no
  const opts = Number.isInteger(num)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 2 }
  return num.toLocaleString('es-AR', opts)
}

export default function MoneyInput({
  value, onChange, placeholder, allowEmpty = false, min = 0,
  showPrefix = true, style = {}, inputStyle = {}, ...rest
}) {
  // Guardamos el texto "en vivo" para respetar lo que tipea el usuario.
  // Sincronizamos con `value` externo cuando cambia por afuera.
  const [text, setText] = useState(value === '' || value == null ? '' : formatDisplay(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    // Solo actualizamos si no estamos tipeando activamente
    if (!focused) {
      const formatted = value === '' || value == null ? '' : formatDisplay(value)
      setText(formatted)
    }
  }, [value, focused])

  const handleChange = (e) => {
    const raw = e.target.value
    setText(raw)  // mostramos lo que tipea sin reformatear (evita saltos del cursor)
    const parsed = parseMoney(raw)
    if (parsed == null) {
      onChange(allowEmpty ? '' : 0)
    } else {
      const clamped = Math.max(min ?? 0, parsed)
      onChange(clamped)
    }
  }

  const handleBlur = () => {
    setFocused(false)
    // Al blur, reformateamos el texto según el número real
    const parsed = parseMoney(text)
    if (parsed == null) {
      setText(allowEmpty ? '' : formatDisplay(0))
    } else {
      const clamped = Math.max(min ?? 0, parsed)
      setText(formatDisplay(clamped))
    }
  }

  const handleFocus = (e) => {
    setFocused(true)
    // Seleccionar contenido para reemplazo rápido
    try { e.target.select() } catch { /* ignore */ }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: '100%', ...style }}>
      {showPrefix && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--txt4)', fontSize: 13, fontWeight: 600, pointerEvents: 'none',
          }}
        >$</span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder ?? '0'}
        style={{
          width: '100%',
          paddingLeft: showPrefix ? 22 : undefined,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          ...inputStyle,
        }}
        {...rest}
      />
    </div>
  )
}
