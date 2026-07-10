const SENSITIVE_KEY = /api[-_]?key|authorization|token|secret|password/i

const redactString = (value: string): string => {
  const bearerRedacted = value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
  return bearerRedacted.replace(/\b(sk|ds|key)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
}

export const redactSensitive = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactString(value)
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitive)
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(item),
      ]),
    )
  }

  return value
}
