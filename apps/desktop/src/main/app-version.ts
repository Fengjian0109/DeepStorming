export const normalizeApplicationVersion = (buildVersion: string): string => {
  const version = buildVersion.trim()

  if (version.length === 0) {
    throw new Error('Application version must not be empty')
  }

  return version
}
