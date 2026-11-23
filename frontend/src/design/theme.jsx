import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

/**
 * Dark/light theme and motion pause, applied to <html data-theme data-motion>.
 * Wrap the app once: <ThemeProvider><App/></ThemeProvider>
 */
export function ThemeProvider({ children, defaultTheme = 'dark' }) {
  const [theme, setTheme] = useState(() => readStored('ht-theme', defaultTheme))
  const [motionPaused, setMotionPaused] = useState(() => readStored('ht-motion', 'running') === 'paused')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    store('ht-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.motion = motionPaused ? 'paused' : 'running'
    store('ht-motion', motionPaused ? 'paused' : 'running')
  }, [motionPaused])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const toggleMotion = useCallback(() => setMotionPaused((p) => !p), [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, motionPaused, toggleMotion }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
