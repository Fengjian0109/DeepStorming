import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CLASSROOM_PREFERENCES,
  createLessonTutorSnapshot,
  normalizeClassroomPreferences,
  normalizeTutorProfileDraft,
  normalizeUserProfileDraft,
  requireAnotherActiveTutor,
} from './learning-settings'

describe('learning settings', () => {
  it('normalizes a tutor profile without losing its teaching controls', () => {
    expect(
      normalizeTutorProfileDraft({
        name: '  林老师  ',
        avatarAssetId: ' avatar-1 ',
        personality: ' 耐心、好奇 ',
        tone: ' 温和但直接 ',
        expertiseTags: [' 数学 ', 'AI', '数学', ''],
        strictness: 4,
        socraticIntensity: 5,
        guidanceStyle: 'question_first',
        bookStrategy: ' 先检查理解，再逐步提示 ',
        paperStrategy: ' 从研究问题和证据出发 ',
        customInstructions: ' 不要直接泄露练习答案 ',
      }),
    ).toEqual({
      name: '林老师',
      avatarAssetId: 'avatar-1',
      personality: '耐心、好奇',
      tone: '温和但直接',
      expertiseTags: ['数学', 'AI'],
      strictness: 4,
      socraticIntensity: 5,
      guidanceStyle: 'question_first',
      bookStrategy: '先检查理解，再逐步提示',
      paperStrategy: '从研究问题和证据出发',
      customInstructions: '不要直接泄露练习答案',
    })
  })

  it('rejects invalid tutor scales and empty required fields', () => {
    const valid = {
      name: 'Tutor',
      personality: 'Patient',
      tone: 'Clear',
      expertiseTags: [],
      strictness: 3,
      socraticIntensity: 3,
      guidanceStyle: 'balanced' as const,
      bookStrategy: 'Teach from evidence',
      paperStrategy: 'Read claims critically',
      customInstructions: '',
    }

    expect(() => normalizeTutorProfileDraft({ ...valid, name: ' ' })).toThrow(
      'Tutor name must not be blank',
    )
    expect(() => normalizeTutorProfileDraft({ ...valid, strictness: 6 })).toThrow(
      'Tutor strictness must be an integer from 1 to 5',
    )
  })

  it('normalizes user identity and allows an absent avatar', () => {
    expect(normalizeUserProfileDraft({ displayName: '  何同学  ' })).toEqual({
      displayName: '何同学',
    })
  })

  it('defaults classroom preferences to standard pace and 30 percent remaining context', () => {
    expect(DEFAULT_CLASSROOM_PREFERENCES).toEqual({
      defaultBookTutorId: null,
      defaultPaperTutorId: null,
      defaultPace: 'standard',
      sendShortcut: 'enter',
      autoScroll: true,
      contextCompressionRemainingPercent: 30,
      recentTurnCount: 8,
    })
  })

  it('accepts only bounded compression thresholds and recent-turn counts', () => {
    expect(
      normalizeClassroomPreferences({
        ...DEFAULT_CLASSROOM_PREFERENCES,
        defaultPace: 'slow',
        contextCompressionRemainingPercent: 10,
        recentTurnCount: 20,
      }),
    ).toMatchObject({
      defaultPace: 'slow',
      contextCompressionRemainingPercent: 10,
      recentTurnCount: 20,
    })

    expect(() =>
      normalizeClassroomPreferences({
        ...DEFAULT_CLASSROOM_PREFERENCES,
        contextCompressionRemainingPercent: 51,
      }),
    ).toThrow('Context compression threshold must be an integer from 10 to 50')
  })

  it('prevents archiving the final active tutor', () => {
    expect(() => requireAnotherActiveTutor(1)).toThrow('At least one active tutor is required')
    expect(() => requireAnotherActiveTutor(2)).not.toThrow()
  })

  it('creates an immutable lesson snapshot with a prompt version', () => {
    const profile = {
      id: 'tutor-1',
      revision: 3,
      status: 'active' as const,
      name: '林老师',
      avatarAssetId: 'avatar-1',
      personality: '耐心',
      tone: '清晰',
      expertiseTags: ['数学'],
      strictness: 4,
      socraticIntensity: 5,
      guidanceStyle: 'question_first' as const,
      bookStrategy: '逐步提示',
      paperStrategy: '检查证据',
      customInstructions: '',
      promptVersion: 'tutor-profile-v3',
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    }

    const snapshot = createLessonTutorSnapshot(profile)
    profile.expertiseTags.push('物理')

    expect(snapshot).toMatchObject({
      tutorProfileId: 'tutor-1',
      tutorProfileRevision: 3,
      promptVersion: 'tutor-profile-v3',
      expertiseTags: ['数学'],
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.expertiseTags)).toBe(true)
  })
})
