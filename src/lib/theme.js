/* ═══════════════════════════════════════
   ANMA — Motor de Marca Blanca
   --color-principal → Sidebar, paneles oscuros, identidad de marca
   --color-acento   → Botones, badges, chips, detalles de énfasis
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
 * Aplica los colores de marca blanca al DOM en tiempo real.
 * @param {string} principal — Color principal (hex), ej: '#7C3AED'
 * @param {string} acento   — Color de acento (hex), ej: '#059669'
 */
export function applyThemeColors(principal, acento) {
  const root = document.documentElement.style

  if (principal) {
    const { r, g, b } = hexToRgb(principal)
    root.setProperty('--color-principal', principal)
    root.setProperty('--brand', principal)
    root.setProperty('--brand-dark', mixHex(principal, '#000000', 0.75))
    root.setProperty('--brand-light', mixHex(principal, '#ffffff', 0.7))
    root.setProperty('--brand-xlt', `rgba(${r},${g},${b},.08)`)
    root.setProperty('--brand-dim', `rgba(${r},${g},${b},.12)`)
    root.setProperty('--grad', `linear-gradient(135deg, ${principal} 0%, ${mixHex(principal, '#6366F1', 0.55)} 100%)`)
    root.setProperty('--grad-soft', `linear-gradient(135deg, rgba(${r},${g},${b},.08) 0%, rgba(${r},${g},${b},.04) 100%)`)
    root.setProperty('--sh-brand', `0 6px 20px rgba(${r},${g},${b},.25)`)

    /* Sidebar y paneles oscuros: tinte del color principal */
    root.setProperty('--sidebar-bg', mixHex(principal, '#0c0a24', 0.15))
    root.setProperty('--panel-grad',
      `linear-gradient(160deg, ${mixHex(principal, '#0c0a24', 0.12)} 0%, ${mixHex(principal, '#1a1650', 0.2)} 50%, ${mixHex(principal, '#2d1a6b', 0.3)} 100%)`
    )
  }

  if (acento) {
    const { r, g, b } = hexToRgb(acento)
    root.setProperty('--color-acento', acento)

    /* Acento: gradiente, sombra y variantes para botones/badges/chips */
    root.setProperty('--acento', acento)
    root.setProperty('--acento-dark', mixHex(acento, '#000000', 0.75))
    root.setProperty('--acento-light', mixHex(acento, '#ffffff', 0.65))
    root.setProperty('--acento-xlt', `rgba(${r},${g},${b},.08)`)
    root.setProperty('--acento-dim', `rgba(${r},${g},${b},.12)`)
    root.setProperty('--acento-grad', acento)
    root.setProperty('--sh-acento', `0 6px 20px rgba(${r},${g},${b},.25)`)

    /* Verde semántico (ganancias, confirmados) sigue al acento */
    root.setProperty('--green', acento)
    root.setProperty('--green-lt', `rgba(${r},${g},${b},.07)`)
    root.setProperty('--green-dim', `rgba(${r},${g},${b},.12)`)
  }
}
