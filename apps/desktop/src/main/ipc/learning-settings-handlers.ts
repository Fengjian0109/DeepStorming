import { randomUUID } from 'node:crypto'

import { LearningSettingsUseCaseError } from '@deepstorming/application'
import type { LearningSettingsSnapshot } from '@deepstorming/application'
import type {
  ClassroomPreferences,
  TutorProfile,
  TutorProfileDraft,
  UserProfile,
  UserProfileDraft,
} from '@deepstorming/domain'
import {
  archiveTutorProfileRequestSchema,
  avatarAssetResultSchema,
  avatarDataResultSchema,
  classroomPreferencesResultSchema,
  createTutorProfileRequestSchema,
  getLearningSettingsRequestSchema,
  importAvatarRequestSchema,
  getAvatarRequestSchema,
  learningSettingsResultSchema,
  saveClassroomPreferencesRequestSchema,
  saveUserProfileRequestSchema,
  tutorProfileResultSchema,
  updateTutorProfileRequestSchema,
  userProfileResultSchema,
  type AppResult,
  type AvatarAssetResult,
  type AvatarDataResult,
  type ClassroomPreferencesResult,
  type CreateTutorProfileRequest,
  type ImportAvatarRequest,
  type GetAvatarRequest,
  type LearningSettingsResult,
  type SaveClassroomPreferencesRequest,
  type SaveUserProfileRequest,
  type TutorProfileResult,
  type UserProfileResult,
} from '@deepstorming/contracts'

type Awaitable<T> = T | Promise<T>
type SafeParseResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; error: Readonly<{ issues: readonly unknown[] }> }>
type Schema<T> = Readonly<{ safeParse(input: unknown): SafeParseResult<T> }>
type ResultSchema<T> = Readonly<{
  safeParse(input: unknown): Readonly<{ success: true; data: T }> | Readonly<{ success: false }>
}>
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u

export type LearningSettingsIpcDependencies = Readonly<{
  getLearningSettings: { execute(): Awaitable<LearningSettingsSnapshot> }
  saveUserProfile: {
    execute(input: { expectedRevision: number; profile: UserProfileDraft }): Awaitable<UserProfile>
  }
  createTutorProfile: {
    execute(input: TutorProfileDraft): Awaitable<TutorProfile>
  }
  updateTutorProfile: {
    execute(input: {
      id: string
      expectedRevision: number
      profile: TutorProfileDraft
    }): Awaitable<TutorProfile>
  }
  archiveTutorProfile: {
    execute(input: { id: string; expectedRevision: number }): Awaitable<TutorProfile>
  }
  saveClassroomPreferences: {
    execute(input: ClassroomPreferences): Awaitable<ClassroomPreferences>
  }
  importAvatar: { execute(sourcePath: string): Awaitable<Readonly<{ assetId: string }>> }
  getAvatarAsset: {
    execute(assetId: string): Awaitable<
      Readonly<{
        assetId: string
        mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
        data: Uint8Array
      }>
    >
  }
}>

const toTutorDraft = (profile: CreateTutorProfileRequest['profile']): TutorProfileDraft => ({
  name: profile.name,
  ...(profile.avatarAssetId === undefined ? {} : { avatarAssetId: profile.avatarAssetId }),
  personality: profile.personality,
  tone: profile.tone,
  expertiseTags: profile.expertiseTags,
  strictness: profile.strictness,
  socraticIntensity: profile.socraticIntensity,
  guidanceStyle: profile.guidanceStyle,
  bookStrategy: profile.bookStrategy,
  paperStrategy: profile.paperStrategy,
  customInstructions: profile.customInstructions,
})

const toUserDraft = (profile: SaveUserProfileRequest['profile']): UserProfileDraft => ({
  displayName: profile.displayName,
  ...(profile.avatarAssetId === undefined ? {} : { avatarAssetId: profile.avatarAssetId }),
})

export type LearningSettingsIpcHandlers = Readonly<{
  get(input: unknown): Promise<LearningSettingsResult>
  saveUser(input: unknown): Promise<UserProfileResult>
  createTutor(input: unknown): Promise<TutorProfileResult>
  updateTutor(input: unknown): Promise<TutorProfileResult>
  archiveTutor(input: unknown): Promise<TutorProfileResult>
  savePreferences(input: unknown): Promise<ClassroomPreferencesResult>
  importAvatar(input: unknown): Promise<AvatarAssetResult>
  getAvatar(input: unknown): Promise<AvatarDataResult>
}>

const requestIdFrom = (input: unknown): string => {
  if (
    input !== null &&
    typeof input === 'object' &&
    'requestId' in input &&
    typeof input.requestId === 'string' &&
    UUID.test(input.requestId)
  ) {
    return input.requestId
  }
  return randomUUID()
}

const handle = async <
  Request extends { requestId: string },
  Data,
  Result extends AppResult<unknown>,
>(
  input: unknown,
  requestSchema: Schema<Request>,
  resultSchema: ResultSchema<Result>,
  execute: (request: Request) => Awaitable<Data>,
): Promise<Result> => {
  const requestId = requestIdFrom(input)
  const parsed = requestSchema.safeParse(input)
  let result: AppResult<Data>
  if (!parsed.success) {
    result = {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'The learning settings request is invalid.',
        retryable: false,
        details: { issueCount: parsed.error.issues.length },
      },
      requestId,
    }
  } else {
    try {
      result = { ok: true, data: await execute(parsed.data), requestId: parsed.data.requestId }
    } catch (error) {
      result = {
        ok: false,
        error:
          error instanceof LearningSettingsUseCaseError
            ? { code: error.code, message: error.message, retryable: error.retryable }
            : {
                code: 'INTERNAL_ERROR',
                message: 'The learning settings request could not be completed.',
                retryable: true,
              },
        requestId: parsed.data.requestId,
      }
    }
  }
  const validated = resultSchema.safeParse(result as Result)
  if (!validated.success) throw new Error('IPC result failed validation')
  return validated.data
}

export const createLearningSettingsIpcHandlers = (
  dependencies: LearningSettingsIpcDependencies,
): LearningSettingsIpcHandlers => ({
  get: (input) =>
    handle(input, getLearningSettingsRequestSchema, learningSettingsResultSchema, () =>
      dependencies.getLearningSettings.execute(),
    ),
  saveUser: (input) =>
    handle(input, saveUserProfileRequestSchema, userProfileResultSchema, (request) =>
      dependencies.saveUserProfile.execute({
        expectedRevision: request.expectedRevision,
        profile: toUserDraft(request.profile),
      }),
    ),
  createTutor: (input) =>
    handle(input, createTutorProfileRequestSchema, tutorProfileResultSchema, (request) =>
      dependencies.createTutorProfile.execute(toTutorDraft(request.profile)),
    ),
  updateTutor: (input) =>
    handle(input, updateTutorProfileRequestSchema, tutorProfileResultSchema, (request) =>
      dependencies.updateTutorProfile.execute({
        id: request.id,
        expectedRevision: request.expectedRevision,
        profile: toTutorDraft(request.profile),
      }),
    ),
  archiveTutor: (input) =>
    handle(input, archiveTutorProfileRequestSchema, tutorProfileResultSchema, (request) =>
      dependencies.archiveTutorProfile.execute({
        id: request.id,
        expectedRevision: request.expectedRevision,
      }),
    ),
  savePreferences: (input) =>
    handle(
      input,
      saveClassroomPreferencesRequestSchema,
      classroomPreferencesResultSchema,
      (request: SaveClassroomPreferencesRequest) =>
        dependencies.saveClassroomPreferences.execute(request.preferences),
    ),
  importAvatar: (input) =>
    handle(
      input,
      importAvatarRequestSchema,
      avatarAssetResultSchema,
      (request: ImportAvatarRequest) => dependencies.importAvatar.execute(request.sourcePath),
    ),
  getAvatar: (input) =>
    handle(
      input,
      getAvatarRequestSchema,
      avatarDataResultSchema,
      async (request: GetAvatarRequest) => {
        const asset = await dependencies.getAvatarAsset.execute(request.assetId)
        return {
          assetId: asset.assetId,
          mediaType: asset.mediaType,
          dataUrl: `data:${asset.mediaType};base64,${Buffer.from(asset.data).toString('base64')}`,
        }
      },
    ),
})
