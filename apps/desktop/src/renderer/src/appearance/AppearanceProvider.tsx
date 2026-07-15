import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  readAppearance,
  resolveAppearance,
  type AppearancePreference,
  type ResolvedAppearance,
  writeAppearance,
} from './appearance'

type AppearanceContextValue = Readonly<{
  preference: AppearancePreference
  resolved: ResolvedAppearance
  setPreference: (preference: AppearancePreference) => void
}>

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined)

export const AppearanceProvider = ({ children }: React.PropsWithChildren) => {
  const [preference, setPreferenceState] = useState<AppearancePreference>(() =>
    readAppearance(window.localStorage),
  )
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const resolved = resolveAppearance(preference, systemDark)
  useEffect(() => {
    document.documentElement.dataset['theme'] = resolved
  }, [resolved])

  const setPreference = useCallback((next: AppearancePreference) => {
    writeAppearance(window.localStorage, next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export const useAppearance = (): AppearanceContextValue => {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider')
  return value
}
