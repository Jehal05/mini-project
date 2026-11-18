import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { createInitialState, reducer } from './engine.js'

const HospitalContext = createContext(null)

export function HospitalProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(Date.now()))

  useEffect(() => {
    if (!state.running) return
    const id = setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 1000)
    return () => clearInterval(id)
  }, [state.running])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <HospitalContext.Provider value={value}>{children}</HospitalContext.Provider>
}

export function useHospital() {
  const ctx = useContext(HospitalContext)
  if (!ctx) throw new Error('useHospital must be used inside <HospitalProvider>')
  return ctx
}
