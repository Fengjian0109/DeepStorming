export const LESSON_PACES = ['slow', 'standard', 'fast'] as const
export const SEND_SHORTCUTS = ['enter', 'mod_enter'] as const
export const TUTOR_GUIDANCE_STYLES = ['question_first', 'balanced', 'explain_first'] as const
export const TUTOR_PROFILE_STATUSES = ['active', 'archived'] as const

export type LessonPace = (typeof LESSON_PACES)[number]
export type SendShortcut = (typeof SEND_SHORTCUTS)[number]
export type TutorGuidanceStyle = (typeof TUTOR_GUIDANCE_STYLES)[number]
export type TutorProfileStatus = (typeof TUTOR_PROFILE_STATUSES)[number]

export type TutorProfileDraft = Readonly<{
  name: string
  avatarAssetId?: string
  personality: string
  tone: string
  expertiseTags: readonly string[]
  strictness: number
  socraticIntensity: number
  guidanceStyle: TutorGuidanceStyle
  bookStrategy: string
  paperStrategy: string
  customInstructions: string
}>

export type TutorProfile = Readonly<
  TutorProfileDraft & {
    id: string
    revision: number
    status: TutorProfileStatus
    promptVersion: string
    createdAt: string
    updatedAt: string
  }
>

export type UserProfileDraft = Readonly<{
  displayName: string
  avatarAssetId?: string
}>

export type UserProfile = Readonly<
  UserProfileDraft & {
    revision: number
    updatedAt: string
  }
>

export type ClassroomPreferences = Readonly<{
  defaultBookTutorId: string | null
  defaultPaperTutorId: string | null
  defaultPace: LessonPace
  sendShortcut: SendShortcut
  autoScroll: boolean
  contextCompressionRemainingPercent: number
  recentTurnCount: number
}>

export type LessonTutorSnapshot = Readonly<{
  tutorProfileId: string
  tutorProfileRevision: number
  name: string
  avatarAssetId?: string
  personality: string
  tone: string
  expertiseTags: readonly string[]
  strictness: number
  socraticIntensity: number
  guidanceStyle: TutorGuidanceStyle
  bookStrategy: string
  paperStrategy: string
  customInstructions: string
  promptVersion: string
}>

export const DEFAULT_CLASSROOM_PREFERENCES: ClassroomPreferences = Object.freeze({
  defaultBookTutorId: null,
  defaultPaperTutorId: null,
  defaultPace: 'standard',
  sendShortcut: 'enter',
  autoScroll: true,
  contextCompressionRemainingPercent: 30,
  recentTurnCount: 8,
})

const normalizeRequired = (value: string, message: string): string => {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(message)
  return normalized
}

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0 ? undefined : normalized
}

const assertScale = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${name} must be an integer from 1 to 5`)
  }
  return value
}

export const normalizeTutorProfileDraft = (draft: TutorProfileDraft): TutorProfileDraft => {
  if (!TUTOR_GUIDANCE_STYLES.includes(draft.guidanceStyle)) {
    throw new Error('Tutor guidance style is invalid')
  }

  const avatarAssetId = normalizeOptional(draft.avatarAssetId)
  const expertiseTags = [
    ...new Set(draft.expertiseTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  ]

  return {
    name: normalizeRequired(draft.name, 'Tutor name must not be blank'),
    ...(avatarAssetId === undefined ? {} : { avatarAssetId }),
    personality: normalizeRequired(draft.personality, 'Tutor personality must not be blank'),
    tone: normalizeRequired(draft.tone, 'Tutor tone must not be blank'),
    expertiseTags,
    strictness: assertScale(draft.strictness, 'Tutor strictness'),
    socraticIntensity: assertScale(draft.socraticIntensity, 'Tutor Socratic intensity'),
    guidanceStyle: draft.guidanceStyle,
    bookStrategy: normalizeRequired(draft.bookStrategy, 'Tutor book strategy must not be blank'),
    paperStrategy: normalizeRequired(draft.paperStrategy, 'Tutor paper strategy must not be blank'),
    customInstructions: draft.customInstructions.trim(),
  }
}

export const normalizeUserProfileDraft = (draft: UserProfileDraft): UserProfileDraft => {
  const avatarAssetId = normalizeOptional(draft.avatarAssetId)
  return {
    displayName: normalizeRequired(draft.displayName, 'User display name must not be blank'),
    ...(avatarAssetId === undefined ? {} : { avatarAssetId }),
  }
}

const normalizeTutorReference = (value: string | null, field: string): string | null => {
  if (value === null) return null
  return normalizeRequired(value, `${field} must not be blank`)
}

export const normalizeClassroomPreferences = (
  preferences: ClassroomPreferences,
): ClassroomPreferences => {
  if (!LESSON_PACES.includes(preferences.defaultPace)) {
    throw new Error('Default lesson pace is invalid')
  }
  if (!SEND_SHORTCUTS.includes(preferences.sendShortcut)) {
    throw new Error('Send shortcut is invalid')
  }
  if (
    !Number.isInteger(preferences.contextCompressionRemainingPercent) ||
    preferences.contextCompressionRemainingPercent < 10 ||
    preferences.contextCompressionRemainingPercent > 50
  ) {
    throw new Error('Context compression threshold must be an integer from 10 to 50')
  }
  if (
    !Number.isInteger(preferences.recentTurnCount) ||
    preferences.recentTurnCount < 1 ||
    preferences.recentTurnCount > 50
  ) {
    throw new Error('Recent turn count must be an integer from 1 to 50')
  }

  return {
    defaultBookTutorId: normalizeTutorReference(
      preferences.defaultBookTutorId,
      'Default book tutor id',
    ),
    defaultPaperTutorId: normalizeTutorReference(
      preferences.defaultPaperTutorId,
      'Default paper tutor id',
    ),
    defaultPace: preferences.defaultPace,
    sendShortcut: preferences.sendShortcut,
    autoScroll: preferences.autoScroll,
    contextCompressionRemainingPercent: preferences.contextCompressionRemainingPercent,
    recentTurnCount: preferences.recentTurnCount,
  }
}

export const requireAnotherActiveTutor = (activeTutorCount: number): void => {
  if (!Number.isInteger(activeTutorCount) || activeTutorCount <= 1) {
    throw new Error('At least one active tutor is required')
  }
}

export const createLessonTutorSnapshot = (profile: TutorProfile): LessonTutorSnapshot => {
  if (profile.status !== 'active') throw new Error('Lesson tutor must be active')
  if (!Number.isInteger(profile.revision) || profile.revision < 1) {
    throw new Error('Tutor profile revision is invalid')
  }

  const expertiseTags = Object.freeze([...profile.expertiseTags])
  return Object.freeze({
    tutorProfileId: normalizeRequired(profile.id, 'Tutor profile id must not be blank'),
    tutorProfileRevision: profile.revision,
    name: profile.name,
    ...(profile.avatarAssetId === undefined ? {} : { avatarAssetId: profile.avatarAssetId }),
    personality: profile.personality,
    tone: profile.tone,
    expertiseTags,
    strictness: profile.strictness,
    socraticIntensity: profile.socraticIntensity,
    guidanceStyle: profile.guidanceStyle,
    bookStrategy: profile.bookStrategy,
    paperStrategy: profile.paperStrategy,
    customInstructions: profile.customInstructions,
    promptVersion: normalizeRequired(
      profile.promptVersion,
      'Tutor prompt version must not be blank',
    ),
  })
}
