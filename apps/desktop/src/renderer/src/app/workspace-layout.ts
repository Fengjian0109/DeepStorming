export const WORKSPACE_LAYOUT_STORAGE_KEY = 'deepstorming.workspace-layout.v1'
export const MAX_COMBINED_SIDEBAR_RATIO = 0.5
export const WORKSPACE_SEPARATOR_TOTAL_WIDTH = 12
export const MIN_PRIMARY_WIDTH = 176
export const MIN_CONTEXTUAL_WIDTH = 220
export const COLLAPSED_RAIL_WIDTH = 56

export type WorkspaceLayout = Readonly<{
  primaryWidth: number
  contextualWidth: number
  primaryCollapsed: boolean
  contextualCollapsed: boolean
  restorePrimaryCollapsed: boolean
  restoreContextualCollapsed: boolean
}>

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  primaryWidth: 220,
  contextualWidth: 300,
  primaryCollapsed: false,
  contextualCollapsed: false,
  restorePrimaryCollapsed: false,
  restoreContextualCollapsed: false,
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

export const maximumCombinedSidebarWidth = (viewportWidth: number): number =>
  Math.max(0, viewportWidth * MAX_COMBINED_SIDEBAR_RATIO - WORKSPACE_SEPARATOR_TOTAL_WIDTH)

export const normalizeWorkspaceLayout = (value: unknown): WorkspaceLayout => {
  if (typeof value !== 'object' || value === null) return DEFAULT_WORKSPACE_LAYOUT

  const candidate = value as Partial<Record<keyof WorkspaceLayout, unknown>>
  const widthsAreValid =
    typeof candidate.primaryWidth === 'number' &&
    Number.isFinite(candidate.primaryWidth) &&
    candidate.primaryWidth >= MIN_PRIMARY_WIDTH &&
    typeof candidate.contextualWidth === 'number' &&
    Number.isFinite(candidate.contextualWidth) &&
    candidate.contextualWidth >= MIN_CONTEXTUAL_WIDTH
  const booleansAreValid = [
    candidate.primaryCollapsed,
    candidate.contextualCollapsed,
    candidate.restorePrimaryCollapsed,
    candidate.restoreContextualCollapsed,
  ].every((entry) => typeof entry === 'boolean')

  if (!widthsAreValid || !booleansAreValid) return DEFAULT_WORKSPACE_LAYOUT

  return {
    primaryWidth: candidate.primaryWidth as number,
    contextualWidth: candidate.contextualWidth as number,
    primaryCollapsed: candidate.primaryCollapsed as boolean,
    contextualCollapsed: candidate.contextualCollapsed as boolean,
    restorePrimaryCollapsed: candidate.restorePrimaryCollapsed as boolean,
    restoreContextualCollapsed: candidate.restoreContextualCollapsed as boolean,
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

  if (current.primaryCollapsed) {
    return input.boundary === 'contextual'
      ? {
          ...current,
          contextualWidth: clamp(
            current.contextualWidth + input.deltaX,
            MIN_CONTEXTUAL_WIDTH,
            maxCombined - COLLAPSED_RAIL_WIDTH,
          ),
        }
      : current
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

  if (preferred.primaryCollapsed && preferred.contextualCollapsed) return preferred
  if (preferred.primaryCollapsed) {
    return {
      ...preferred,
      contextualWidth: Math.min(preferred.contextualWidth, maxCombined - COLLAPSED_RAIL_WIDTH),
    }
  }
  if (preferred.contextualCollapsed) {
    return { ...preferred, primaryWidth: Math.min(preferred.primaryWidth, maxCombined) }
  }

  return resizeWorkspaceLayout(preferred, {
    boundary: 'contextual',
    deltaX: 0,
    viewportWidth,
  })
}

export const togglePrimarySidebar = (current: WorkspaceLayout): WorkspaceLayout => ({
  ...current,
  primaryCollapsed: !current.primaryCollapsed,
})

export const toggleContextualSidebar = (current: WorkspaceLayout): WorkspaceLayout => ({
  ...current,
  contextualCollapsed: !current.contextualCollapsed,
})

export const toggleAllSidebars = (current: WorkspaceLayout): WorkspaceLayout => {
  const bothCollapsed = current.primaryCollapsed && current.contextualCollapsed
  if (bothCollapsed) {
    return {
      ...current,
      primaryCollapsed: current.restorePrimaryCollapsed,
      contextualCollapsed: current.restoreContextualCollapsed,
    }
  }

  return {
    ...current,
    restorePrimaryCollapsed: current.primaryCollapsed,
    restoreContextualCollapsed: current.contextualCollapsed,
    primaryCollapsed: true,
    contextualCollapsed: true,
  }
}

export const readWorkspaceLayout = (storage: Pick<Storage, 'getItem'>): WorkspaceLayout => {
  try {
    const serialized = storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)
    return serialized === null
      ? DEFAULT_WORKSPACE_LAYOUT
      : normalizeWorkspaceLayout(JSON.parse(serialized))
  } catch {
    return DEFAULT_WORKSPACE_LAYOUT
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
