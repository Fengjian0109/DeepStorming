import { describe, expect, it } from 'vitest'

import type { ClassroomPreferences, TutorProfile, UserProfile } from '@deepstorming/domain'

import type {
  AvatarAssetStorePort,
  LearningSettingsRepositoryPort,
  LearningSettingsSnapshot,
  SettingsWriteResult,
} from './learning-settings-ports'
import {
  ArchiveTutorProfile,
  CreateTutorProfile,
  GetAvatarAsset,
  GetLearningSettings,
  LearningSettingsUseCaseError,
  SaveClassroomPreferences,
  SaveUserProfile,
  UpdateTutorProfile,
} from './learning-settings-use-cases'

const now = '2026-07-14T00:00:00.000Z'
const ids = { generate: () => '0142b3c4-d5e6-4789-8abc-def012345678' }
const clock = { now: () => now }

const draft = {
  name: '林老师',
  personality: '耐心',
  tone: '清晰',
  expertiseTags: ['数学'],
  strictness: 4,
  socraticIntensity: 5,
  guidanceStyle: 'question_first' as const,
  bookStrategy: '逐步提示',
  paperStrategy: '检查证据',
  customInstructions: '',
}

class MemorySettingsRepository implements LearningSettingsRepositoryPort {
  public userProfile: UserProfile | undefined
  public tutorProfiles: TutorProfile[] = []
  public preferences: ClassroomPreferences | undefined
  public conflictNext = false

  public async getSnapshot(): Promise<LearningSettingsSnapshot | undefined> {
    if (
      this.userProfile === undefined ||
      this.preferences === undefined ||
      this.tutorProfiles.length === 0
    ) {
      return undefined
    }
    return {
      userProfile: this.userProfile,
      tutorProfiles: this.tutorProfiles,
      classroomPreferences: this.preferences,
    }
  }

  public async bootstrap(snapshot: LearningSettingsSnapshot): Promise<LearningSettingsSnapshot> {
    this.userProfile = snapshot.userProfile
    this.tutorProfiles = [...snapshot.tutorProfiles]
    this.preferences = snapshot.classroomPreferences
    return snapshot
  }

  public async saveUserProfile(
    expectedRevision: number,
    profile: UserProfile,
  ): Promise<SettingsWriteResult<UserProfile>> {
    if (this.conflictNext || this.userProfile?.revision !== expectedRevision)
      return { status: 'stale' }
    this.userProfile = profile
    return { status: 'applied', value: profile }
  }

  public async createTutor(profile: TutorProfile): Promise<SettingsWriteResult<TutorProfile>> {
    this.tutorProfiles.push(profile)
    return { status: 'applied', value: profile }
  }

  public async updateTutor(
    expectedRevision: number,
    profile: TutorProfile,
  ): Promise<SettingsWriteResult<TutorProfile>> {
    const index = this.tutorProfiles.findIndex((candidate) => candidate.id === profile.id)
    if (index < 0) return { status: 'not_found' }
    if (this.conflictNext || this.tutorProfiles[index]?.revision !== expectedRevision) {
      return { status: 'stale' }
    }
    this.tutorProfiles[index] = profile
    return { status: 'applied', value: profile }
  }

  public async countActiveTutors(): Promise<number> {
    return this.tutorProfiles.filter((profile) => profile.status === 'active').length
  }

  public async saveClassroomPreferences(
    preferences: ClassroomPreferences,
  ): Promise<ClassroomPreferences> {
    this.preferences = preferences
    return preferences
  }
}

describe('learning settings use cases', () => {
  it('bootstraps a neutral Socratic tutor and 30 percent context threshold', async () => {
    const repository = new MemorySettingsRepository()
    const settings = await new GetLearningSettings(repository, clock, ids).execute()

    expect(settings.userProfile.displayName).toBe('学习者')
    expect(settings.tutorProfiles).toHaveLength(1)
    expect(settings.tutorProfiles[0]).toMatchObject({
      name: '苏格拉底导师',
      status: 'active',
      revision: 1,
    })
    expect(settings.classroomPreferences.contextCompressionRemainingPercent).toBe(30)
  })

  it('normalizes and versions newly created and updated tutors', async () => {
    const repository = new MemorySettingsRepository()
    await new GetLearningSettings(repository, clock, ids).execute()

    const created = await new CreateTutorProfile(repository, clock, ids).execute({
      ...draft,
      name: '  林老师 ',
    })
    expect(created).toMatchObject({
      name: '林老师',
      revision: 1,
      promptVersion: 'tutor-profile-v1',
    })

    const updated = await new UpdateTutorProfile(repository, clock).execute({
      id: created.id,
      expectedRevision: 1,
      profile: { ...draft, name: '林教授' },
    })
    expect(updated).toMatchObject({
      name: '林教授',
      revision: 2,
      promptVersion: 'tutor-profile-v2',
    })
  })

  it('maps optimistic conflicts to a stable settings error', async () => {
    const repository = new MemorySettingsRepository()
    const settings = await new GetLearningSettings(repository, clock, ids).execute()
    repository.conflictNext = true

    await expect(
      new UpdateTutorProfile(repository, clock).execute({
        id: settings.tutorProfiles[0]!.id,
        expectedRevision: 1,
        profile: draft,
      }),
    ).rejects.toMatchObject({ code: 'SETTINGS_REVISION_CONFLICT', retryable: true })
  })

  it('refuses to archive the final active tutor', async () => {
    const repository = new MemorySettingsRepository()
    const settings = await new GetLearningSettings(repository, clock, ids).execute()

    await expect(
      new ArchiveTutorProfile(repository, clock).execute({
        id: settings.tutorProfiles[0]!.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'LAST_TUTOR_REQUIRED', retryable: false })
  })

  it('saves user profile and validates default tutor references', async () => {
    const repository = new MemorySettingsRepository()
    const settings = await new GetLearningSettings(repository, clock, ids).execute()

    const user = await new SaveUserProfile(repository, clock).execute({
      expectedRevision: 1,
      profile: { displayName: '  何同学 ' },
    })
    expect(user).toMatchObject({ displayName: '何同学', revision: 2 })

    await expect(
      new SaveClassroomPreferences(repository).execute({
        ...settings.classroomPreferences,
        defaultBookTutorId: 'missing-tutor',
      }),
    ).rejects.toBeInstanceOf(LearningSettingsUseCaseError)

    await expect(
      new SaveClassroomPreferences(repository).execute({
        ...settings.classroomPreferences,
        defaultBookTutorId: settings.tutorProfiles[0]!.id,
      }),
    ).resolves.toMatchObject({ defaultBookTutorId: settings.tutorProfiles[0]!.id })
  })

  it('loads avatar bytes through a validated application use case', async () => {
    const assetId = `${'a'.repeat(64)}.png`
    const repository = new MemorySettingsRepository()
    const settings = await new GetLearningSettings(repository, clock, ids).execute()
    await new SaveUserProfile(repository, clock).execute({
      expectedRevision: settings.userProfile.revision,
      profile: { displayName: settings.userProfile.displayName, avatarAssetId: assetId },
    })
    const store: AvatarAssetStorePort = {
      importAvatar: async () => ({ assetId }),
      readAvatar: async () => ({
        assetId,
        mediaType: 'image/png',
        data: new Uint8Array([137, 80, 78, 71]),
      }),
      removeAvatar: async () => undefined,
    }

    await expect(new GetAvatarAsset(store, repository).execute(assetId)).resolves.toEqual({
      assetId,
      mediaType: 'image/png',
      data: new Uint8Array([137, 80, 78, 71]),
    })
    await expect(
      new GetAvatarAsset(store, repository).execute('../secret.png'),
    ).rejects.toMatchObject({
      code: 'LEARNING_SETTINGS_INVALID',
      retryable: false,
    })
  })

  it('loads an avatar referenced by a tutor profile', async () => {
    const assetId = `${'c'.repeat(64)}.webp`
    const repository = new MemorySettingsRepository()
    const settings = await new GetLearningSettings(repository, clock, ids).execute()
    const tutor = settings.tutorProfiles[0]!
    await new UpdateTutorProfile(repository, clock).execute({
      id: tutor.id,
      expectedRevision: tutor.revision,
      profile: {
        ...draft,
        avatarAssetId: assetId,
      },
    })
    const store: AvatarAssetStorePort = {
      importAvatar: async () => ({ assetId }),
      readAvatar: async () => ({
        assetId,
        mediaType: 'image/webp',
        data: new Uint8Array([82, 73, 70, 70]),
      }),
      removeAvatar: async () => undefined,
    }

    await expect(new GetAvatarAsset(store, repository).execute(assetId)).resolves.toMatchObject({
      assetId,
      mediaType: 'image/webp',
    })
  })

  it('refuses to load an avatar that is not referenced by the learning settings', async () => {
    const assetId = `${'b'.repeat(64)}.png`
    const repository = new MemorySettingsRepository()
    await new GetLearningSettings(repository, clock, ids).execute()
    const store: AvatarAssetStorePort = {
      importAvatar: async () => ({ assetId }),
      readAvatar: async () => ({
        assetId,
        mediaType: 'image/png',
        data: new Uint8Array([137, 80, 78, 71]),
      }),
      removeAvatar: async () => undefined,
    }
    await expect(new GetAvatarAsset(store, repository).execute(assetId)).rejects.toMatchObject({
      code: 'AVATAR_LOAD_FAILED',
      retryable: false,
    })
  })
})
