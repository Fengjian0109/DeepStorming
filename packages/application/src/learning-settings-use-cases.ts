import {
  DEFAULT_CLASSROOM_PREFERENCES,
  normalizeClassroomPreferences,
  normalizeTutorProfileDraft,
  normalizeUserProfileDraft,
  requireAnotherActiveTutor,
  type ClassroomPreferences,
  type TutorProfile,
  type TutorProfileDraft,
  type UserProfile,
  type UserProfileDraft,
} from '@deepstorming/domain'

import type { ClockPort, IdGeneratorPort } from './document-ports'
import type {
  AvatarAssetStorePort,
  LearningSettingsRepositoryPort,
  LearningSettingsSnapshot,
  SettingsWriteResult,
} from './learning-settings-ports'

export type LearningSettingsErrorCode =
  | 'LEARNING_SETTINGS_INVALID'
  | 'LEARNING_SETTINGS_NOT_FOUND'
  | 'SETTINGS_REVISION_CONFLICT'
  | 'LAST_TUTOR_REQUIRED'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'AVATAR_IMPORT_FAILED'
  | 'AVATAR_LOAD_FAILED'

export class LearningSettingsUseCaseError extends Error {
  public override readonly name = 'LearningSettingsUseCaseError'

  public constructor(
    public readonly code: LearningSettingsErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
  }
}

const databaseError = () =>
  new LearningSettingsUseCaseError(
    'DATABASE_UNAVAILABLE',
    'Learning settings are temporarily unavailable.',
    true,
  )
const invalidError = () =>
  new LearningSettingsUseCaseError(
    'LEARNING_SETTINGS_INVALID',
    'The learning settings are invalid.',
    false,
  )
const notFoundError = () =>
  new LearningSettingsUseCaseError(
    'LEARNING_SETTINGS_NOT_FOUND',
    'The tutor profile was not found.',
    false,
  )
const conflictError = () =>
  new LearningSettingsUseCaseError(
    'SETTINGS_REVISION_CONFLICT',
    'The settings changed in another operation. Reload and try again.',
    true,
  )

const normalizeTutor = (draft: TutorProfileDraft): TutorProfileDraft => {
  try {
    return normalizeTutorProfileDraft(draft)
  } catch {
    throw invalidError()
  }
}

const timestamp = (clock: ClockPort): string => {
  try {
    return clock.now()
  } catch {
    throw new LearningSettingsUseCaseError(
      'INTERNAL_ERROR',
      'The operation could not start.',
      false,
    )
  }
}

const generatedId = (ids: IdGeneratorPort): string => {
  try {
    return ids.generate()
  } catch {
    throw new LearningSettingsUseCaseError(
      'INTERNAL_ERROR',
      'The operation could not start.',
      false,
    )
  }
}

const loadSnapshot = async (
  repository: LearningSettingsRepositoryPort,
): Promise<LearningSettingsSnapshot> => {
  try {
    const snapshot = await repository.getSnapshot()
    if (snapshot === undefined) throw notFoundError()
    return snapshot
  } catch (error) {
    if (error instanceof LearningSettingsUseCaseError) throw error
    throw databaseError()
  }
}

const unwrapWrite = <T>(result: SettingsWriteResult<T>): T => {
  if (result.status === 'applied') return result.value
  if (result.status === 'stale') throw conflictError()
  throw notFoundError()
}

const defaultTutorDraft: TutorProfileDraft = {
  name: '苏格拉底导师',
  personality: '耐心、好奇、尊重学习者的思考过程',
  tone: '清晰、温和、克制',
  expertiseTags: ['通识学习', '苏格拉底式教学'],
  strictness: 3,
  socraticIntensity: 4,
  guidanceStyle: 'question_first',
  bookStrategy: '先确认学习目标和已有理解，再通过逐层追问、提示与短讲解帮助学习者建构知识。',
  paperStrategy: '从研究问题、贡献、方法、证据和局限出发，引导学习者检验论文论证。',
  customInstructions: '',
}

export class GetLearningSettings {
  public constructor(
    private readonly repository: LearningSettingsRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(): Promise<LearningSettingsSnapshot> {
    try {
      const existing = await this.repository.getSnapshot()
      if (existing !== undefined) return existing

      const now = timestamp(this.clock)
      const tutorId = generatedId(this.ids)
      const tutor: TutorProfile = {
        id: tutorId,
        revision: 1,
        status: 'active',
        ...normalizeTutor(defaultTutorDraft),
        promptVersion: 'tutor-profile-v1',
        createdAt: now,
        updatedAt: now,
      }
      return await this.repository.bootstrap({
        userProfile: { displayName: '学习者', revision: 1, updatedAt: now },
        tutorProfiles: [tutor],
        classroomPreferences: {
          ...DEFAULT_CLASSROOM_PREFERENCES,
          defaultBookTutorId: tutorId,
          defaultPaperTutorId: tutorId,
        },
      })
    } catch (error) {
      if (error instanceof LearningSettingsUseCaseError) throw error
      throw databaseError()
    }
  }
}

export class SaveUserProfile {
  public constructor(
    private readonly repository: LearningSettingsRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(input: {
    expectedRevision: number
    profile: UserProfileDraft
  }): Promise<UserProfile> {
    let normalized: UserProfileDraft
    try {
      normalized = normalizeUserProfileDraft(input.profile)
    } catch {
      throw invalidError()
    }
    const profile: UserProfile = {
      ...normalized,
      revision: input.expectedRevision + 1,
      updatedAt: timestamp(this.clock),
    }
    try {
      return unwrapWrite(await this.repository.saveUserProfile(input.expectedRevision, profile))
    } catch (error) {
      if (error instanceof LearningSettingsUseCaseError) throw error
      throw databaseError()
    }
  }
}

export class CreateTutorProfile {
  public constructor(
    private readonly repository: LearningSettingsRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(draft: TutorProfileDraft): Promise<TutorProfile> {
    const now = timestamp(this.clock)
    const profile: TutorProfile = {
      id: generatedId(this.ids),
      revision: 1,
      status: 'active',
      ...normalizeTutor(draft),
      promptVersion: 'tutor-profile-v1',
      createdAt: now,
      updatedAt: now,
    }
    try {
      return unwrapWrite(await this.repository.createTutor(profile))
    } catch (error) {
      if (error instanceof LearningSettingsUseCaseError) throw error
      throw databaseError()
    }
  }
}

export class UpdateTutorProfile {
  public constructor(
    private readonly repository: LearningSettingsRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(input: {
    id: string
    expectedRevision: number
    profile: TutorProfileDraft
  }): Promise<TutorProfile> {
    const snapshot = await loadSnapshot(this.repository)
    const existing = snapshot.tutorProfiles.find((profile) => profile.id === input.id)
    if (existing === undefined) throw notFoundError()
    const revision = input.expectedRevision + 1
    const updated: TutorProfile = {
      id: existing.id,
      revision,
      status: existing.status,
      ...normalizeTutor(input.profile),
      promptVersion: `tutor-profile-v${revision}`,
      createdAt: existing.createdAt,
      updatedAt: timestamp(this.clock),
    }
    try {
      return unwrapWrite(await this.repository.updateTutor(input.expectedRevision, updated))
    } catch (error) {
      if (error instanceof LearningSettingsUseCaseError) throw error
      throw databaseError()
    }
  }
}

export class ArchiveTutorProfile {
  public constructor(
    private readonly repository: LearningSettingsRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(input: { id: string; expectedRevision: number }): Promise<TutorProfile> {
    const snapshot = await loadSnapshot(this.repository)
    const existing = snapshot.tutorProfiles.find((profile) => profile.id === input.id)
    if (existing === undefined) throw notFoundError()
    if (existing.status === 'archived') return existing
    let activeCount: number
    try {
      activeCount = await this.repository.countActiveTutors()
      requireAnotherActiveTutor(activeCount)
    } catch (error) {
      if (error instanceof Error && error.message === 'At least one active tutor is required') {
        throw new LearningSettingsUseCaseError(
          'LAST_TUTOR_REQUIRED',
          'At least one active tutor is required.',
          false,
        )
      }
      throw databaseError()
    }
    const revision = input.expectedRevision + 1
    const updated: TutorProfile = {
      ...existing,
      status: 'archived',
      revision,
      promptVersion: `tutor-profile-v${revision}`,
      updatedAt: timestamp(this.clock),
    }
    try {
      return unwrapWrite(await this.repository.updateTutor(input.expectedRevision, updated))
    } catch (error) {
      if (error instanceof LearningSettingsUseCaseError) throw error
      throw databaseError()
    }
  }
}

export class SaveClassroomPreferences {
  public constructor(private readonly repository: LearningSettingsRepositoryPort) {}

  public async execute(input: ClassroomPreferences): Promise<ClassroomPreferences> {
    let preferences: ClassroomPreferences
    try {
      preferences = normalizeClassroomPreferences(input)
    } catch {
      throw invalidError()
    }
    const snapshot = await loadSnapshot(this.repository)
    const activeTutorIds = new Set(
      snapshot.tutorProfiles
        .filter((profile) => profile.status === 'active')
        .map((profile) => profile.id),
    )
    for (const tutorId of [preferences.defaultBookTutorId, preferences.defaultPaperTutorId]) {
      if (tutorId !== null && !activeTutorIds.has(tutorId)) throw invalidError()
    }
    try {
      return await this.repository.saveClassroomPreferences(preferences)
    } catch {
      throw databaseError()
    }
  }
}

export class ImportAvatar {
  public constructor(private readonly store: AvatarAssetStorePort) {}

  public async execute(sourcePath: string): Promise<Readonly<{ assetId: string }>> {
    if (sourcePath.trim().length === 0) throw invalidError()
    try {
      return await this.store.importAvatar(sourcePath)
    } catch {
      throw new LearningSettingsUseCaseError(
        'AVATAR_IMPORT_FAILED',
        'The avatar could not be imported. Choose a PNG, JPEG, or WebP image under 5 MB.',
        false,
      )
    }
  }
}

const AVATAR_ASSET_ID = /^[a-f\d]{64}\.(?:png|jpg|jpeg|webp)$/u

const avatarLoadError = () =>
  new LearningSettingsUseCaseError('AVATAR_LOAD_FAILED', 'The avatar could not be loaded.', false)

export class GetAvatarAsset {
  public constructor(
    private readonly store: AvatarAssetStorePort,
    private readonly repository: LearningSettingsRepositoryPort,
  ) {}

  public async execute(assetId: string): Promise<
    Readonly<{
      assetId: string
      mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
      data: Uint8Array
    }>
  > {
    if (!AVATAR_ASSET_ID.test(assetId)) throw invalidError()
    try {
      const settings = await this.repository.getSnapshot()
      const referenced =
        settings?.userProfile.avatarAssetId === assetId ||
        settings?.tutorProfiles.some((profile) => profile.avatarAssetId === assetId) === true
      if (!referenced) throw avatarLoadError()
      return await this.store.readAvatar(assetId)
    } catch (error) {
      if (error instanceof LearningSettingsUseCaseError) throw error
      throw avatarLoadError()
    }
  }
}
