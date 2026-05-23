import { createContext, useContext, useState, useEffect } from 'react'
import { db, dbW } from '../lib/storage'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'tasks'
const TaskFabCtx = createContext(null)

export function TaskFabProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [panelOpen, setPanelOpen] = useState(false)
  // Lazy init reads from user-scoped key if auth already resolved (session restore),
  // or from global key on first load before auth — re-read on userId change below.
  const [tasks, setTasks] = useState(() => db(STORAGE_KEY, []))
  const [focusMode, setFocusMode] = useState(false)

  // Re-read from the correct user-scoped key whenever the logged-in user changes.
  // Covers: login, logout, account switch.
  useEffect(() => {
    setTasks(db(STORAGE_KEY, []))
  }, [userId])

  // Persist on every change. Fires after reads too, but that's idempotent.
  useEffect(() => {
    dbW(STORAGE_KEY, tasks)
  }, [tasks])

  const activeTasks = tasks.filter(t => !t.done)

  return (
    <TaskFabCtx.Provider value={{ panelOpen, setPanelOpen, tasks, setTasks, activeTasks, focusMode, setFocusMode }}>
      {children}
    </TaskFabCtx.Provider>
  )
}

export const useTaskFab = () => useContext(TaskFabCtx)
