import { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'anma3_tasks'
const TaskFabCtx = createContext(null)

export function TaskFabProvider({ children }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [tasks, setTasks] = useState([])
  const [focusMode, setFocusMode] = useState(false)

  useEffect(() => {
    try { setTasks(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []) } catch { setTasks([]) }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  const activeTasks = tasks.filter(t => !t.done)

  return (
    <TaskFabCtx.Provider value={{ panelOpen, setPanelOpen, tasks, setTasks, activeTasks, focusMode, setFocusMode }}>
      {children}
    </TaskFabCtx.Provider>
  )
}

export const useTaskFab = () => useContext(TaskFabCtx)
