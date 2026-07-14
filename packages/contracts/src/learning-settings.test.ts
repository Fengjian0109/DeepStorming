import { describe, expect, it } from 'vitest'

import {
  classroomPreferencesSchema,
  learningSettingsSchema,
  tutorProfileDraftSchema,
  tutorProfileSchema,
} from './learning-settings'

const tutorDraft = {
  name: '林老师',
  personality: '耐心',
  tone: '清晰',
  expertiseTags: ['数学'],
  strictness: 4,
  socraticIntensity: 5,
  guidanceStyle: 'question_first',
  bookStrategy: '逐步提示',
  paperStrategy: '检查证据',
  customInstructions: '',
}

describe('learning settings contracts', () => {
  it('accepts a strict tutor draft and rejects unknown fields', () => {
    expect(tutorProfileDraftSchema.parse(tutorDraft)).toEqual(tutorDraft)
    expect(() => tutorProfileDraftSchema.parse({ ...tutorDraft, systemOverride: true })).toThrow()
  })

  it('requires tutor revisions and prompt versions in stored profiles', () => {
    expect(
      tutorProfileSchema.parse({
        ...tutorDraft,
        id: '0142b3c4-d5e6-4789-8abc-def012345678',
        revision: 1,
        status: 'active',
        promptVersion: 'tutor-profile-v1',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
      }),
    ).toMatchObject({ revision: 1, status: 'active' })
  })

  it('enforces classroom compression and recent-turn bounds', () => {
    const preferences = {
      defaultBookTutorId: null,
      defaultPaperTutorId: null,
      defaultPace: 'standard',
      sendShortcut: 'enter',
      autoScroll: true,
      contextCompressionRemainingPercent: 30,
      recentTurnCount: 8,
    }

    expect(classroomPreferencesSchema.parse(preferences)).toEqual(preferences)
    expect(() =>
      classroomPreferencesSchema.parse({
        ...preferences,
        contextCompressionRemainingPercent: 60,
      }),
    ).toThrow()
  })

  it('requires a complete settings bundle', () => {
    expect(() =>
      learningSettingsSchema.parse({
        userProfile: { displayName: '学习者', revision: 1, updatedAt: '2026-07-14T00:00:00.000Z' },
        tutorProfiles: [],
      }),
    ).toThrow()
  })
})
