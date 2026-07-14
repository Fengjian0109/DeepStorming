import type { LearningSettingsSnapshot } from '@deepstorming/application'
import type { ClassroomPreferences, TutorProfile, UserProfile } from '@deepstorming/domain'
import { describe, expect, it, vi } from 'vitest'

import {
  createLearningSettingsIpcHandlers,
  type LearningSettingsIpcDependencies,
} from './learning-settings-handlers'

const REQUEST_ID = 'f4b7fd8f-4f47-4a61-9224-151f51f347de'
const TUTOR_ID = '0142b3c4-d5e6-4789-8abc-def012345678'
const timestamp = '2026-07-14T00:00:00.000Z'
const tutor = {
  id: TUTOR_ID,
  revision: 1,
  status: 'active',
  name: '苏格拉底导师',
  personality: '耐心',
  tone: '清晰',
  expertiseTags: ['通识'],
  strictness: 3,
  socraticIntensity: 4,
  guidanceStyle: 'question_first',
  bookStrategy: '逐步提示',
  paperStrategy: '检查证据',
  customInstructions: '',
  promptVersion: 'tutor-profile-v1',
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies TutorProfile
const user = {
  displayName: '学习者',
  revision: 1,
  updatedAt: timestamp,
} satisfies UserProfile
const preferences = {
  defaultBookTutorId: TUTOR_ID,
  defaultPaperTutorId: TUTOR_ID,
  defaultPace: 'standard',
  sendShortcut: 'enter',
  autoScroll: true,
  contextCompressionRemainingPercent: 30,
  recentTurnCount: 8,
} satisfies ClassroomPreferences
const settings = {
  userProfile: user,
  tutorProfiles: [tutor],
  classroomPreferences: preferences,
} satisfies LearningSettingsSnapshot

const dependencies = (): LearningSettingsIpcDependencies => ({
  getLearningSettings: { execute: vi.fn(() => settings) },
  saveUserProfile: { execute: vi.fn(() => user) },
  createTutorProfile: { execute: vi.fn(() => tutor) },
  updateTutorProfile: { execute: vi.fn(() => tutor) },
  archiveTutorProfile: { execute: vi.fn(() => tutor) },
  saveClassroomPreferences: { execute: vi.fn(() => preferences) },
  importAvatar: { execute: vi.fn(() => ({ assetId: `${'a'.repeat(64)}.png` })) },
})

describe('learning settings IPC handlers', () => {
  it('validates and calls exactly one settings use case', async () => {
    const deps = dependencies()
    const handlers = createLearningSettingsIpcHandlers(deps)

    await expect(handlers.get({ requestId: REQUEST_ID })).resolves.toEqual({
      ok: true,
      data: settings,
      requestId: REQUEST_ID,
    })
    expect(deps.getLearningSettings.execute).toHaveBeenCalledTimes(1)
    expect(deps.createTutorProfile.execute).not.toHaveBeenCalled()

    await expect(handlers.savePreferences({ requestId: REQUEST_ID, preferences })).resolves.toEqual(
      { ok: true, data: preferences, requestId: REQUEST_ID },
    )
    expect(deps.saveClassroomPreferences.execute).toHaveBeenCalledWith(preferences)
  })

  it('rejects malformed requests before a use case is called', async () => {
    const deps = dependencies()
    const handlers = createLearningSettingsIpcHandlers(deps)

    const result = await handlers.createTutor({
      requestId: REQUEST_ID,
      profile: { ...tutor, unknownInstruction: 'ignore safety' },
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(deps.createTutorProfile.execute).not.toHaveBeenCalled()
  })

  it('uses a dedicated avatar import operation and never returns a source path', async () => {
    const deps = dependencies()
    const handlers = createLearningSettingsIpcHandlers(deps)
    const result = await handlers.importAvatar({
      requestId: REQUEST_ID,
      sourcePath: '/tmp/avatar.png',
    })

    expect(deps.importAvatar.execute).toHaveBeenCalledWith('/tmp/avatar.png')
    expect(JSON.stringify(result)).not.toContain('/tmp/avatar.png')
    expect(result).toMatchObject({ ok: true, data: { assetId: `${'a'.repeat(64)}.png` } })
  })
})
