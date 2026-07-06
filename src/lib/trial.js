/* ─────────────────────────────────────────
   ANMA Regalos — Trial engine
   7 días desde trial_started_at en user_metadata.
   Si el usuario tiene `subscribed: true` o `invited_to_site`
   (operador invitado), el trial no aplica.
───────────────────────────────────────── */
export const TRIAL_DAYS = 7

/**
 * @param {object|null} user  — Supabase user object
 * @returns {{ isTrial, active, expired, daysLeft, elapsedDays }}
 */
export function getTrialStatus(user) {
  const NONE = { isTrial: false, active: false, expired: false, daysLeft: 0, elapsedDays: 0 }
  if (!user) return NONE

  const meta = user.user_metadata || {}

  // Usuarios suscritos o invitados → sin restricciones de trial
  if (meta.subscribed)       return NONE
  if (meta.invited_to_site)  return NONE

  // Sin trial_started_at → usuario legacy (anterior al sistema de trial)
  if (!meta.trial_started_at) return NONE

  const started     = new Date(meta.trial_started_at).getTime()
  const elapsed     = Date.now() - started
  const elapsedDays = Math.floor(elapsed / 86_400_000)
  const daysLeft    = Math.max(0, TRIAL_DAYS - elapsedDays)

  return {
    isTrial:     true,
    active:      daysLeft > 0,
    expired:     daysLeft === 0,
    daysLeft,
    elapsedDays,
  }
}
