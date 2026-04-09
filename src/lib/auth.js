const SESSION_KEY = 'anma3_session'
const SESSION_DURATION = 8 * 60 * 60 * 1000 // 8 hours

export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '_anma_salt_2024')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function createSession() {
  const session = {
    token: crypto.randomUUID(),
    expires: Date.now() + SESSION_DURATION,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function isSessionValid() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    return s && s.expires > Date.now()
  } catch {
    return false
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
