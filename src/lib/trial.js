/* ─────────────────────────────────────────
   ANMA Regalos — Trial engine
   BRANCH TESTERS: trial desactivado — acceso libre sin restricciones.
───────────────────────────────────────── */
export const TRIAL_DAYS = 7

/**
 * @param {object|null} user  — Supabase user object
 * @returns {{ isTrial, active, expired, daysLeft, elapsedDays }}
 */
export function getTrialStatus(_user) {
  return { isTrial: false, active: false, expired: false, daysLeft: 0, elapsedDays: 0 }
}
