/**
 * ANMA Regalos — Logger central
 * Espejo del logger de Pro. Ver doc en anma-app/src/lib/logger.js
 */

const isDev = import.meta.env?.DEV === true ||
              (typeof window !== 'undefined' && window.location.hostname === 'localhost')

const ts = () => new Date().toISOString().slice(11, 19)

let remoteSink = null
export function setRemoteSink(fn) { remoteSink = typeof fn === 'function' ? fn : null }

function send(level, args) {
  if (isDev) {
    const prefix = `[ANMA ${ts()}] ${level.toUpperCase()}`
    // eslint-disable-next-line no-console
    const c = console[level] || console.log
    c(prefix, ...args)
  } else if (level === 'error' && remoteSink) {
    try { remoteSink(level, args) } catch { /* never throw from logger */ }
  }
}

export const log = {
  info:  (...args) => send('info', args),
  log:   (...args) => send('log', args),
  warn:  (...args) => send('warn', args),
  error: (...args) => send('error', args),
  debug: (...args) => isDev && send('debug', args),
}

export default log
