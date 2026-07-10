export const RUNTIME_PLATFORMS = ['darwin', 'win32', 'linux', 'unknown'] as const

export type RuntimePlatform = (typeof RUNTIME_PLATFORMS)[number]

export type ApplicationInfo = Readonly<{
  name: string
  version: string
  platform: RuntimePlatform
}>

const normalizeNonEmpty = (value: string, field: string): string => {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`)
  }

  return normalized
}

export const createApplicationInfo = (input: {
  name: string
  version: string
  platform: string
}): ApplicationInfo => ({
  name: normalizeNonEmpty(input.name, 'name'),
  version: normalizeNonEmpty(input.version, 'version'),
  platform: RUNTIME_PLATFORMS.includes(input.platform as RuntimePlatform)
    ? (input.platform as RuntimePlatform)
    : 'unknown',
})
