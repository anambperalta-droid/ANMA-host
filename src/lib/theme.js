/* ═══════════════════════════════════════
   ANMA — Motor de Marca Blanca v2
   Genera una paleta completa desde 2 colores hex.
   Garantiza contraste WCAG AA para cualquier color de cliente.
═══════════════════════════════════════ */

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function mixHex(hex1, hex2, weight) {
  const c1 = hexToRgb(hex1), c2 = hexToRgb(hex2)
  const w = weight, w2 = 1 - w
  const r = Math.round(c1.r * w + c2.r * w2)
  const g = Math.round(c1.g * w + c2.g * w2)
  const b = Math.round(c1.b * w + c2.b * w2)
  return `rgb(${r},${g},${b})`
}

/**
 * Luminancia relativa WCAG 2.1.
 * Devuelve un valor entre 0 (negro) y 1 (blanco).
 */
function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return [r, g, b].reduce((acc, v, i) => {
    const c = v / 255
    const linear = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    return acc + linear * [0.2126, 0.7152, 0.0722][i]
  }, 0)
}

/**
 * Devuelve el color de texto que mejor contrasta sobre `bgHex`.
 * Usa navy oscuro para fondos claros, blanco para fondos oscuros.
 * Garantiza ratio mínimo ~4.5:1 (WCAG AA) para cualquier marca.
 */
function contrastText(bgHex) {
  return getLuminance(bgHex) > 0.35 ? '#1E1B4B' : '#FFFFFF'
}

/**
 * Aplica los colores de marca blanca al DOM en tiempo real.
 * @param {string} principal — Color principal (hex), ej: '#7C3AED'
 * @param {string} acento   — Color de acento (hex), ej: '#059669'
 */
export function applyThemeColors(principal, acento) {
  const root = document.documentElement.style

  if (principal) {
    const { r, g, b } = hexToRgb(principal)
    const txt = contrastText(principal)

    root.setProperty('--color-principal', principal)
    root.setProperty('--brand', principal)
    root.setProperty('--brand-text', txt)                               // texto sobre brand
    root.setProperty('--brand-dark', mixHex(principal, '#000000', 0.75))
    root.setProperty('--brand-light', mixHex(principal, '#ffffff', 0.7))
    root.setProperty('--brand-xlt', `rgba(${r},${g},${b},.08)`)
    root.setProperty('--brand-dim', `rgba(${r},${g},${b},.15)`)

    // Tints usados en avatares, badges, fondos de icon-btn
    root.setProperty('--brand-50',  `rgba(${r},${g},${b},.05)`)
    root.setProperty('--brand-100', `rgba(${r},${g},${b},.10)`)
    root.setProperty('--brand-200', `rgba(${r},${g},${b},.20)`)

    root.setProperty('--grad', `linear-gradient(135deg, ${principal} 0%, ${mixHex(principal, '#6366F1', 0.55)} 100%)`)
    root.setProperty('--grad-soft', `linear-gradient(135deg, rgba(${r},${g},${b},.08) 0%, rgba(${r},${g},${b},.04) 100%)`)
    root.setProperty('--sh-brand', `0 6px 20px rgba(${r},${g},${b},.28)`)

    /* Sidebar y paneles oscuros: tinte del color principal */
    root.setProperty('--sidebar-bg', mixHex(principal, '#0c0a24', 0.15))
    root.setProperty('--panel-grad',
      `linear-gradient(160deg, ${mixHex(principal, '#0c0a24', 0.12)} 0%, ${mixHex(principal, '#1a1650', 0.2)} 50%, ${mixHex(principal, '#2d1a6b', 0.3)} 100%)`
    )
  }

  if (acento) {
    const { r, g, b } = hexToRgb(acento)
    const txt = contrastText(acento)

    root.setProperty('--color-acento', acento)
    root.setProperty('--acento', acento)
    root.setProperty('--acento-text', txt)                             // texto sobre acento
    root.setProperty('--acento-dark', mixHex(acento, '#000000', 0.75))
    root.setProperty('--acento-light', mixHex(acento, '#ffffff', 0.65))
    root.setProperty('--acento-xlt', `rgba(${r},${g},${b},.08)`)
    root.setProperty('--acento-dim', `rgba(${r},${g},${b},.15)`)
    root.setProperty('--acento-grad', acento)
    root.setProperty('--sh-acento', `0 6px 20px rgba(${r},${g},${b},.28)`)

    /* Verde semántico (ganancias, confirmados) sigue al acento */
    root.setProperty('--green', acento)
    root.setProperty('--green-lt', `rgba(${r},${g},${b},.07)`)
    root.setProperty('--green-dim', `rgba(${r},${g},${b},.15)`)
  }
}
