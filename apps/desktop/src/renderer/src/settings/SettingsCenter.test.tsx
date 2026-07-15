// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
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
import { AppearanceProvider } from '../appearance/AppearanceProvider'

const renderSettings = () =>
  render(
    <AppearanceProvider>
      <SettingsCenter />
    </AppearanceProvider>,
  )

beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
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
      updateTutor: vi.fn().mockImplementation(async (_id, _revision, draft) => ({
        ok: true,
        data: { ...tutor, ...draft, revision: 2, updatedAt: timestamp },
        requestId,
      })),
      archiveTutor: vi.fn(),
      saveClassroomPreferences: vi.fn().mockImplementation(async (value) => ({
        ok: true,
        data: value,
        requestId,
      })),
      importAvatar: vi.fn().mockResolvedValue({
        ok: true,
        data: { assetId: 'avatar-asset-1' },
        requestId,
      }),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SettingsCenter', () => {
  it('loads settings and exposes every progressive settings category', async () => {
    const user = userEvent.setup()
    renderSettings()

    expect(screen.getByText('正在加载学习设置…')).toBeTruthy()
    const nav = await screen.findByRole('navigation', { name: '设置分类' })
    for (const name of ['AI Provider', '导师 / 伙伴', '个人资料', '课堂设置', '外观']) {
      expect(within(nav).getByRole('button', { name })).toBeTruthy()
    }
    await user.click(await screen.findByRole('button', { name: '导师 / 伙伴' }))
    expect(screen.getByText('苏格拉底导师')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '外观' }))
    expect(screen.getByRole('heading', { name: '外观' })).toBeTruthy()
  })

  it('saves the user display name with revision semantics', async () => {
    const user = userEvent.setup()
    renderSettings()

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
    renderSettings()

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

  it('imports and saves a tutor avatar through the controlled asset API', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: '导师 / 伙伴' }))
    await user.click(screen.getByRole('button', { name: '编辑 苏格拉底导师' }))
    const avatar = new File([new Uint8Array([137, 80, 78, 71])], 'tutor.png', {
      type: 'image/png',
    })
    await user.upload(screen.getByLabelText('选择导师头像 文件输入'), avatar)
    expect(await screen.findByText('导师头像已导入并安全保存。')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '保存导师' }))

    expect(window.deepstorming.learningSettings.importAvatar).toHaveBeenCalledWith(avatar)
    expect(window.deepstorming.learningSettings.updateTutor).toHaveBeenCalledWith(
      tutorId,
      1,
      expect.objectContaining({ avatarAssetId: 'avatar-asset-1' }),
    )
  })

  it('keeps a dirty tutor detail open when leaving is rejected', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSettings()

    await user.click(await screen.findByRole('button', { name: '导师 / 伙伴' }))
    await user.click(screen.getByRole('button', { name: '编辑 苏格拉底导师' }))
    await user.type(screen.getByLabelText('性格'), '、严谨')
    await user.click(screen.getByRole('button', { name: '外观' }))

    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '编辑导师' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '外观' })).toBeNull()
  })
})
