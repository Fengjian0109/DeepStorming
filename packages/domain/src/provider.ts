export const PROVIDER_TYPES = ['mock', 'deepseek', 'openai_compatible'] as const

export type ProviderType = (typeof PROVIDER_TYPES)[number]

export type ProviderTestStatus = 'testing' | 'success' | 'error' | 'cancelled'

export type ProviderCapabilities = Readonly<{
  streaming: boolean
  structuredOutput: boolean
  embedding: boolean
  vision: boolean
}>

export type ProviderDraft = Readonly<{
  providerType: ProviderType
  displayName: string
  baseUrl?: string
  modelName: string
  apiKey?: string
}>

export type ProviderProfile = Readonly<{
  id: string
  providerType: ProviderType
  displayName: string
  baseUrl?: string
  modelName: string
  hasApiKey: boolean
  capabilities: ProviderCapabilities
  isActive: boolean
  lastTestStatus?: ProviderTestStatus
  lastTestedAt?: string
  createdAt: string
  updatedAt: string
}>

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const MASKED_API_KEY = /^[*•]+$/u

const PROVIDER_CAPABILITIES = {
  mock: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  deepseek: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  openai_compatible: {
    streaming: true,
    structuredOutput: false,
    embedding: false,
    vision: false,
  },
} as const satisfies Readonly<Record<ProviderType, ProviderCapabilities>>

type ParsedUrl = Readonly<{
  protocol: string
  hostname: string
  hasCredentials: boolean
}>

const normalizeNonEmpty = (value: string, field: string): string => {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`)
  }

  return normalized
}

const parseUrl = (value: string): ParsedUrl | undefined => {
  const match = /^([a-z][a-z\d+.-]*):\/\/([^/?#]+)(?:[/?#].*)?$/iu.exec(value)

  if (match === null) {
    return undefined
  }

  const protocol = match[1]?.toLowerCase()
  const authority = match[2]

  if (protocol === undefined || authority === undefined || /\s/u.test(authority)) {
    return undefined
  }

  const hasCredentials = authority.includes('@')
  const hostAndPort = hasCredentials ? authority.slice(authority.lastIndexOf('@') + 1) : authority
  let hostname: string
  let port: string | undefined

  if (hostAndPort.startsWith('[')) {
    const closingBracket = hostAndPort.indexOf(']')

    if (closingBracket < 2) {
      return undefined
    }

    hostname = hostAndPort.slice(0, closingBracket + 1).toLowerCase()
    const remainder = hostAndPort.slice(closingBracket + 1)

    if (remainder.length > 0) {
      if (!remainder.startsWith(':')) {
        return undefined
      }
      port = remainder.slice(1)
    }
  } else {
    const colon = hostAndPort.lastIndexOf(':')

    if (colon >= 0) {
      hostname = hostAndPort.slice(0, colon).toLowerCase()
      port = hostAndPort.slice(colon + 1)
    } else {
      hostname = hostAndPort.toLowerCase()
    }
  }

  if (
    hostname.length === 0 ||
    !isValidHostname(hostname) ||
    (port !== undefined && !isValidPort(port))
  ) {
    return undefined
  }

  return { protocol, hostname, hasCredentials }
}

const isValidPort = (port: string): boolean => {
  if (!/^\d+$/u.test(port)) {
    return false
  }

  const portNumber = Number(port)
  return portNumber >= 1 && portNumber <= 65_535
}

const isValidIpv4 = (hostname: string): boolean => {
  const octets = hostname.split('.')

  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
  )
}

const isValidIpv6 = (hostname: string): boolean => {
  const address = hostname.slice(1, -1)
  const compressionIndex = address.indexOf('::')

  if (
    address.length === 0 ||
    (compressionIndex >= 0 && compressionIndex !== address.lastIndexOf('::'))
  ) {
    return false
  }

  const groups = address.split(':').filter((group) => group.length > 0)
  const lastGroup = groups.at(-1)
  const hasIpv4Suffix = lastGroup?.includes('.') === true

  if (hasIpv4Suffix && (lastGroup === undefined || !isValidIpv4(lastGroup))) {
    return false
  }

  const hexadecimalGroups = hasIpv4Suffix ? groups.slice(0, -1) : groups

  if (!hexadecimalGroups.every((group) => /^[\da-f]{1,4}$/u.test(group))) {
    return false
  }

  const groupCount = hexadecimalGroups.length + (hasIpv4Suffix ? 2 : 0)
  return compressionIndex >= 0 ? groupCount < 8 : groupCount === 8
}

const isValidHostname = (hostname: string): boolean => {
  if (hostname.startsWith('[') || hostname.endsWith(']')) {
    return hostname.startsWith('[') && hostname.endsWith(']') && isValidIpv6(hostname)
  }

  if (/^[\d.]+$/u.test(hostname)) {
    return isValidIpv4(hostname)
  }

  if (hostname.length > 253) {
    return false
  }

  return hostname.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/u.test(label))
}

const normalizeBaseUrl = (value: string, allowInsecureLoopback: boolean): string => {
  const normalized = value.trim()
  const parsed = parseUrl(normalized)

  if (parsed === undefined) {
    throw new Error('baseUrl must be a valid URL')
  }

  if (parsed.hasCredentials) {
    throw new Error('baseUrl must not include credentials')
  }

  if (parsed.protocol === 'https') {
    return normalized
  }

  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)

  if (parsed.protocol === 'http' && allowInsecureLoopback && isLoopback) {
    return normalized
  }

  throw new Error('baseUrl must use HTTPS')
}

const normalizeApiKey = (apiKey: string | undefined): string | undefined => {
  const normalized = apiKey?.trim()

  if (normalized === undefined || normalized.length === 0) {
    return undefined
  }

  if (MASKED_API_KEY.test(normalized)) {
    throw new Error('Masked API keys cannot be saved')
  }

  return normalized
}

export const normalizeProviderDraft = (
  draft: ProviderDraft,
  options: { allowInsecureLoopback?: boolean } = {},
): ProviderDraft => {
  const normalizedDraft = {
    providerType: draft.providerType,
    displayName: normalizeNonEmpty(draft.displayName, 'displayName'),
    modelName: normalizeNonEmpty(draft.modelName, 'modelName'),
  }
  const apiKey = normalizeApiKey(draft.apiKey)

  if (draft.providerType === 'mock') {
    return normalizedDraft
  }

  const baseUrl = normalizeBaseUrl(
    draft.baseUrl?.trim() || (draft.providerType === 'deepseek' ? DEEPSEEK_BASE_URL : ''),
    options.allowInsecureLoopback === true,
  )

  return {
    ...normalizedDraft,
    baseUrl,
    ...(apiKey === undefined ? {} : { apiKey }),
  }
}

export const assertProviderHasCredential = ({
  providerType,
  hasExistingKey,
  apiKey,
}: {
  providerType: ProviderType
  hasExistingKey: boolean
  apiKey?: string
}): void => {
  const normalizedApiKey = normalizeApiKey(apiKey)

  if (providerType === 'mock' || hasExistingKey || normalizedApiKey !== undefined) {
    return
  }

  throw new Error('API key is required')
}

export const capabilitiesFor = (providerType: ProviderType): ProviderCapabilities =>
  PROVIDER_CAPABILITIES[providerType]
