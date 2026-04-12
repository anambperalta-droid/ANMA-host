import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastContext'
import { CURRENT_SITE } from '../lib/invites'

const Ctx = createContext()

/**
 * Verifica si el usuario tiene permiso para acceder al sitio actual.
 * Reglas:
 *  1. Si el user NO tiene metadata `allowed_sites` → acceso libre (legacy)
 *  2. Si tiene `allowed_sites` → debe incluir el key del sitio actual
 *  3. Si tiene `invited_to_site` → debe coincidir con el sitio actual
 *
 * Los admin globales tienen acceso a todo siempre.
 */
function canAccessSite(user) {
  if (!user) return false
  const meta = user.user_metadata || {}

  // Admins globales: siempre tienen acceso a ambos sitios
  const globalAdmins = ['ana.mbperalta@gmail.com']
  if (globalAdmins.includes(user.email)) return true

  // Si el usuario tiene lista explícita de sitios permitidos
  const allowed = meta.allowed_sites
  if (Array.isArray(allowed) && allowed.length > 0) {
    return allowed.includes(CURRENT_SITE.key)
  }

  // Si fue invitado a un sitio específico, solo puede entrar a ese
  const invitedTo = meta.invited_to_site
  if (invitedTo) {
    return invitedTo === CURRENT_SITE.key
  }

  // Usuarios legacy (sin metadata de sitio): acceso libre
  return true
}

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [siteBlocked, setSiteBlocked] = useState(false)
  const toast = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !canAccessSite(session.user)) {
        setSiteBlocked(true)
        setAuthed(false)
        setUser(null)
      } else {
        setAuthed(!!session)
        setUser(session?.user ?? null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !canAccessSite(session.user)) {
        setSiteBlocked(true)
        setAuthed(false)
        setUser(null)
        return
      }
      setSiteBlocked(false)
      setAuthed(!!session)
      setUser(session?.user ?? null)
      if (_event === 'SIGNED_OUT') {
        toast('Sesion cerrada.', 'in')
      }
    })

    return () => subscription.unsubscribe()
  }, [toast])

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message

    if (data.user && !canAccessSite(data.user)) {
      await supabase.auth.signOut()
      return `No tenés acceso a ${CURRENT_SITE.label}. Contactá al administrador.`
    }

    return null
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setAuthed(false)
    setUser(null)
    setSiteBlocked(false)
  }, [])

  return (
    <Ctx.Provider value={{ authed, loading, user, login, logout, siteBlocked }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
