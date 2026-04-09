import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastContext'

const Ctx = createContext()

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const toast = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
      setUser(session?.user ?? null)
      if (_event === 'SIGNED_OUT') {
        toast('Sesion cerrada.', 'in')
      }
    })

    return () => subscription.unsubscribe()
  }, [toast])

  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setAuthed(false)
    setUser(null)
  }, [])

  return (
    <Ctx.Provider value={{ authed, loading, user, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
