export type AppearancePreference = 'system' | 'light' | 'dark'
export type ResolvedAppearance = 'light' | 'dark'

export const APPEARANCE_STORAGE_KEY = 'deepstorming.appearance.v1'

export const readAppearance = (storage: Pick<Storage, 'getItem'>): AppearancePreference => {
  try {
    const value = storage.getItem(APPEARANCE_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export const writeAppearance = (
  storage: Pick<Storage, 'setItem'>,
  value: AppearancePreference,
): boolean => {
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

export const resolveAppearance = (
  preference: AppearancePreference,
  systemDark: boolean,
): ResolvedAppearance => (preference === 'system' ? (systemDark ? 'dark' : 'light') : preference)
