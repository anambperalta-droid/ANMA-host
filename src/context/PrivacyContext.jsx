import { createContext, useContext, useState } from 'react'
import { fmt } from '../lib/storage'

const Ctx = createContext(null)
const KEY = 'anma_privacy'

export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })
  const toggle = () => setHidden(h => {
    const next = !h
    try { localStorage.setItem(KEY, next ? '1' : '0') } catch {}
    return next
  })
  const money = (v) => hidden ? '••••' : fmt(v)
  return <Ctx.Provider value={{ hidden, toggle, money }}>{children}</Ctx.Provider>
}

export const usePrivacy = () => useContext(Ctx)
