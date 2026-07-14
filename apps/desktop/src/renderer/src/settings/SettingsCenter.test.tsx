// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestId = 'f4b7fd8f-4f47-4a61-9224-151f51f347de'
const tutorId = '0142b3c4-d5e6-4789-8abc-def012345678'
const timestamp = '2026-07-14T00:00:00.000Z'
const tutor = {
  id: tutorId,
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
}
const preferences = {
  defaultBookTutorId: tutorId,
  defaultPaperTutorId: tutorId,
  defaultPace: 'standard',
  sendShortcut: 'enter',
  autoScroll: true,
  contextCompressionRemainingPercent: 30,
  recentTurnCount: 8,
}

vi.mock('../provider/ProviderManager', async () => {
  const ReactModule = await import('react')
  return {
    ProviderManager: () => ReactModule.createElement('section', null, 'Provider 设置内容'),
  }
})

import { SettingsCenter } from './SettingsCenter'

beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('deepstorming', {
    learningSettings: {
      get: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          userProfile: { displayName: '学习者', revision: 1, updatedAt: timestamp },
          tutorProfiles: [tutor],
          classroomPreferences: preferences,
        },
        requestId,
      }),
      saveUserProfile: vi.fn().mockImplementation(async (_revision, profile) => ({
        ok: true,
        data: { ...profile, revision: 2, updatedAt: timestamp },
        requestId,
      })),
      createTutor: vi.fn(),
      updateTutor: vi.fn(),
      archiveTutor: vi.fn(),
      saveClassroomPreferences: vi.fn().mockImplementation(async (value) => ({
        ok: true,
        data: value,
        requestId,
      })),
      importAvatar: vi.fn(),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SettingsCenter', () => {
  it('loads settings and exposes provider, tutor, profile, and classroom sections', async () => {
    const user = userEvent.setup()
    render(<SettingsCenter />)

    expect(screen.getByText('正在加载学习设置…')).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: '导师 / 伙伴' }))
    expect(screen.getByText('苏格拉底导师')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'AI Provider' }))
    expect(screen.getByText('Provider 设置内容')).toBeTruthy()
  })

  it('saves the user display name with revision semantics', async () => {
    const user = userEvent.setup()
    render(<SettingsCenter />)

    await user.click(await screen.findByRole('button', { name: '个人资料' }))
    const input = screen.getByLabelText('你的名称')
    await user.clear(input)
    await user.type(input, '何同学')
    await user.click(screen.getByRole('button', { name: '保存个人资料' }))

    expect(await screen.findByText('个人资料已保存。')).toBeTruthy()
    expect(window.deepstorming.learningSettings.saveUserProfile).toHaveBeenCalledWith(1, {
      displayName: '何同学',
    })
  })

  it('saves classroom pace and compression threshold', async () => {
    const user = userEvent.setup()
    render(<SettingsCenter />)

    await user.click(await screen.findByRole('button', { name: '课堂设置' }))
    await user.selectOptions(screen.getByLabelText('默认课堂节奏'), 'fast')
    await user.clear(screen.getByLabelText('剩余上下文压缩阈值（%）'))
    await user.type(screen.getByLabelText('剩余上下文压缩阈值（%）'), '25')
    await user.click(screen.getByRole('button', { name: '保存课堂设置' }))

    expect(await screen.findByText('课堂设置已保存。')).toBeTruthy()
    expect(window.deepstorming.learningSettings.saveClassroomPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPace: 'fast', contextCompressionRemainingPercent: 25 }),
    )
  })
})
