export const WORKSPACE_LAYOUT_STORAGE_KEY = 'deepstorming.workspace-layout.v2'
export const DEFAULT_COMBINED_SIDEBAR_RATIO = 0.4
export const MAX_COMBINED_SIDEBAR_RATIO = 0.5
export const WORKSPACE_SEPARATOR_TOTAL_WIDTH = 12
export const MIN_PRIMARY_WIDTH = 176
export const MIN_CONTEXTUAL_WIDTH = 220
export const COLLAPSED_RAIL_WIDTH = 48

export type WorkspaceLayout = Readonly<{
  primaryWidth: number
  contextualWidth: number
  primaryCollapsed: boolean
  contextualCollapsed: boolean
}>

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

export const maximumCombinedSidebarWidth = (viewportWidth: number): number =>
  Math.max(0, viewportWidth * MAX_COMBINED_SIDEBAR_RATIO - WORKSPACE_SEPARATOR_TOTAL_WIDTH)

export const createDefaultWorkspaceLayout = (viewportWidth: number): WorkspaceLayout => {
  const target = viewportWidth * DEFAULT_COMBINED_SIDEBAR_RATIO
  const primaryWidth = Math.max(MIN_PRIMARY_WIDTH, Math.round(viewportWidth * 0.15))

  return {
    primaryWidth,
    contextualWidth: Math.max(MIN_CONTEXTUAL_WIDTH, Math.round(target - primaryWidth)),
    primaryCollapsed: false,
    contextualCollapsed: true,
  }
}

// Kept as a compatibility default while the shell migrates to viewport-aware initialization.
export const DEFAULT_WORKSPACE_LAYOUT = createDefaultWorkspaceLayout(1280)

export const normalizeWorkspaceLayout = (value: unknown, viewportWidth = 1280): WorkspaceLayout => {
  const fallback = createDefaultWorkspaceLayout(viewportWidth)
  if (typeof value !== 'object' || value === null) return fallback

  const candidate = value as Partial<Record<keyof WorkspaceLayout, unknown>>
  const widthsAreValid =
    typeof candidate.primaryWidth === 'number' &&
    Number.isFinite(candidate.primaryWidth) &&
    candidate.primaryWidth >= MIN_PRIMARY_WIDTH &&
    typeof candidate.contextualWidth === 'number' &&
    Number.isFinite(candidate.contextualWidth) &&
    candidate.contextualWidth >= MIN_CONTEXTUAL_WIDTH
  const booleansAreValid = [candidate.primaryCollapsed, candidate.contextualCollapsed].every(
    (entry) => typeof entry === 'boolean',
  )

  if (!widthsAreValid || !booleansAreValid) return fallback

  const primaryCollapsed = candidate.primaryCollapsed as boolean
  return {
    primaryWidth: candidate.primaryWidth as number,
    contextualWidth: candidate.contextualWidth as number,
    primaryCollapsed,
    contextualCollapsed: primaryCollapsed || (candidate.contextualCollapsed as boolean),
  }
}

export const resizeWorkspaceLayout = (
  current: WorkspaceLayout,
  input: Readonly<{
    boundary: 'primary' | 'contextual'
    deltaX: number
    viewportWidth: number
  }>,
): WorkspaceLayout => {
  const maxCombined = maximumCombinedSidebarWidth(input.viewportWidth)

  if (current.primaryCollapsed && current.contextualCollapsed) return current
  if (maxCombined < MIN_PRIMARY_WIDTH + MIN_CONTEXTUAL_WIDTH) {
    return { ...current, contextualCollapsed: true }
  }

  if (current.contextualCollapsed) {
    return input.boundary === 'primary'
      ? {
          ...current,
          primaryWidth: clamp(current.primaryWidth + input.deltaX, MIN_PRIMARY_WIDTH, maxCombined),
        }
      : current
  }

  if (input.boundary === 'primary') {
    const primaryWidth = clamp(
      current.primaryWidth + input.deltaX,
      MIN_PRIMARY_WIDTH,
      maxCombined - MIN_CONTEXTUAL_WIDTH,
    )

    return {
      ...current,
      primaryWidth,
      contextualWidth: clamp(
        current.contextualWidth,
        MIN_CONTEXTUAL_WIDTH,
        maxCombined - primaryWidth,
      ),
    }
  }

  const contextualWidth = clamp(
    current.contextualWidth + input.deltaX,
    MIN_CONTEXTUAL_WIDTH,
    maxCombined - MIN_PRIMARY_WIDTH,
  )

  return {
    ...current,
    contextualWidth,
    primaryWidth: clamp(current.primaryWidth, MIN_PRIMARY_WIDTH, maxCombined - contextualWidth),
  }
}

export const fitWorkspaceLayoutToViewport = (
  preferred: WorkspaceLayout,
  viewportWidth: number,
): WorkspaceLayout => {
  const maxCombined = maximumCombinedSidebarWidth(viewportWidth)

  if (preferred.primaryCollapsed) {
    return { ...preferred, contextualCollapsed: true }
  }
  if (maxCombined < MIN_PRIMARY_WIDTH + MIN_CONTEXTUAL_WIDTH) {
    return { ...preferred, contextualCollapsed: true }
  }
  if (preferred.contextualCollapsed) {
    return {
      ...preferred,
      primaryWidth: clamp(preferred.primaryWidth, MIN_PRIMARY_WIDTH, maxCombined),
    }
  }

  return resizeWorkspaceLayout(preferred, {
    boundary: 'contextual',
    deltaX: 0,
    viewportWidth,
  })
}

export const togglePrimarySidebar = (current: WorkspaceLayout): WorkspaceLayout =>
  current.primaryCollapsed
    ? { ...current, primaryCollapsed: false, contextualCollapsed: true }
    : { ...current, primaryCollapsed: true, contextualCollapsed: true }

export const toggleContextualSidebar = (current: WorkspaceLayout): WorkspaceLayout =>
  current.primaryCollapsed
    ? current
    : { ...current, contextualCollapsed: !current.contextualCollapsed }

export const navigatePrimarySidebar = (
  current: WorkspaceLayout,
  sameTarget: boolean,
): WorkspaceLayout => ({
  ...current,
  primaryCollapsed: false,
  contextualCollapsed: sameTarget ? !current.contextualCollapsed : false,
})

export const readWorkspaceLayout = (
  storage: Pick<Storage, 'getItem'>,
  viewportWidth = 1280,
): WorkspaceLayout => {
  try {
    const serialized = storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)
    return serialized === null
      ? createDefaultWorkspaceLayout(viewportWidth)
      : normalizeWorkspaceLayout(JSON.parse(serialized), viewportWidth)
  } catch {
    return createDefaultWorkspaceLayout(viewportWidth)
  }
}

export const writeWorkspaceLayout = (
  storage: Pick<Storage, 'setItem'>,
  value: WorkspaceLayout,
): boolean => {
  try {
    storage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
