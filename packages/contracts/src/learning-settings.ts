import { z } from 'zod'

import { createAppResultSchema } from './app-result'

export const LEARNING_SETTINGS_CHANNELS = {
  get: 'learning-settings:get',
  saveUserProfile: 'learning-settings:save-user-profile',
  createTutor: 'learning-settings:create-tutor',
  updateTutor: 'learning-settings:update-tutor',
  archiveTutor: 'learning-settings:archive-tutor',
  saveClassroomPreferences: 'learning-settings:save-classroom-preferences',
  importAvatar: 'learning-settings:import-avatar',
} as const

const requiredTextSchema = z.string().trim().min(1)
const optionalAssetIdSchema = z.string().trim().min(1).optional()
const timestampSchema = z.iso.datetime()

export const lessonPaceSchema = z.enum(['slow', 'standard', 'fast'])
export const sendShortcutSchema = z.enum(['enter', 'mod_enter'])
export const tutorGuidanceStyleSchema = z.enum(['question_first', 'balanced', 'explain_first'])
export const tutorProfileStatusSchema = z.enum(['active', 'archived'])

export const tutorProfileDraftSchema = z
  .object({
    name: requiredTextSchema,
    avatarAssetId: optionalAssetIdSchema,
    personality: requiredTextSchema,
    tone: requiredTextSchema,
    expertiseTags: z.array(requiredTextSchema).max(32),
    strictness: z.number().int().min(1).max(5),
    socraticIntensity: z.number().int().min(1).max(5),
    guidanceStyle: tutorGuidanceStyleSchema,
    bookStrategy: requiredTextSchema,
    paperStrategy: requiredTextSchema,
    customInstructions: z.string(),
  })
  .strict()

export const tutorProfileSchema = tutorProfileDraftSchema
  .extend({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    status: tutorProfileStatusSchema,
    promptVersion: requiredTextSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const userProfileDraftSchema = z
  .object({
    displayName: requiredTextSchema,
    avatarAssetId: optionalAssetIdSchema,
  })
  .strict()

export const userProfileSchema = userProfileDraftSchema
  .extend({
    revision: z.number().int().positive(),
    updatedAt: timestampSchema,
  })
  .strict()

export const classroomPreferencesSchema = z
  .object({
    defaultBookTutorId: z.string().uuid().nullable(),
    defaultPaperTutorId: z.string().uuid().nullable(),
    defaultPace: lessonPaceSchema,
    sendShortcut: sendShortcutSchema,
    autoScroll: z.boolean(),
    contextCompressionRemainingPercent: z.number().int().min(10).max(50),
    recentTurnCount: z.number().int().min(1).max(50),
  })
  .strict()

export const learningSettingsSchema = z
  .object({
    userProfile: userProfileSchema,
    tutorProfiles: z.array(tutorProfileSchema).min(1),
    classroomPreferences: classroomPreferencesSchema,
  })
  .strict()

const requestIdSchema = z.string().uuid()

export const getLearningSettingsRequestSchema = z.object({ requestId: requestIdSchema }).strict()
export const saveUserProfileRequestSchema = z
  .object({
    requestId: requestIdSchema,
    expectedRevision: z.number().int().positive(),
    profile: userProfileDraftSchema,
  })
  .strict()
export const createTutorProfileRequestSchema = z
  .object({ requestId: requestIdSchema, profile: tutorProfileDraftSchema })
  .strict()
export const updateTutorProfileRequestSchema = z
  .object({
    requestId: requestIdSchema,
    id: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    profile: tutorProfileDraftSchema,
  })
  .strict()
export const archiveTutorProfileRequestSchema = z
  .object({
    requestId: requestIdSchema,
    id: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
  })
  .strict()
export const saveClassroomPreferencesRequestSchema = z
  .object({ requestId: requestIdSchema, preferences: classroomPreferencesSchema })
  .strict()
export const importAvatarRequestSchema = z
  .object({ requestId: requestIdSchema, sourcePath: requiredTextSchema })
  .strict()

export const avatarAssetSchema = z
  .object({ assetId: z.string().regex(/^[a-f\d]{64}\.(?:png|jpg|jpeg|webp)$/u) })
  .strict()

export const learningSettingsResultSchema = createAppResultSchema(learningSettingsSchema)
export const tutorProfileResultSchema = createAppResultSchema(tutorProfileSchema)
export const userProfileResultSchema = createAppResultSchema(userProfileSchema)
export const classroomPreferencesResultSchema = createAppResultSchema(classroomPreferencesSchema)
export const avatarAssetResultSchema = createAppResultSchema(avatarAssetSchema)

export type TutorProfileDraftDto = z.infer<typeof tutorProfileDraftSchema>
export type TutorProfileDto = z.infer<typeof tutorProfileSchema>
export type UserProfileDraftDto = z.infer<typeof userProfileDraftSchema>
export type UserProfileDto = z.infer<typeof userProfileSchema>
export type ClassroomPreferencesDto = z.infer<typeof classroomPreferencesSchema>
export type LearningSettingsDto = z.infer<typeof learningSettingsSchema>
export type LearningSettingsResult = z.infer<typeof learningSettingsResultSchema>
export type TutorProfileResult = z.infer<typeof tutorProfileResultSchema>
export type UserProfileResult = z.infer<typeof userProfileResultSchema>
export type ClassroomPreferencesResult = z.infer<typeof classroomPreferencesResultSchema>
export type AvatarAssetResult = z.infer<typeof avatarAssetResultSchema>
export type GetLearningSettingsRequest = z.infer<typeof getLearningSettingsRequestSchema>
export type SaveUserProfileRequest = z.infer<typeof saveUserProfileRequestSchema>
export type CreateTutorProfileRequest = z.infer<typeof createTutorProfileRequestSchema>
export type UpdateTutorProfileRequest = z.infer<typeof updateTutorProfileRequestSchema>
export type ArchiveTutorProfileRequest = z.infer<typeof archiveTutorProfileRequestSchema>
export type SaveClassroomPreferencesRequest = z.infer<typeof saveClassroomPreferencesRequestSchema>
export type ImportAvatarRequest = z.infer<typeof importAvatarRequestSchema>
