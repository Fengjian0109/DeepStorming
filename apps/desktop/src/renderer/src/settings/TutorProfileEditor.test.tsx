// @vitest-environment jsdom

import type { TutorProfileDto } from '@deepstorming/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TutorProfileEditor } from './TutorProfileEditor'

const tutor: TutorProfileDto = {
  id: '0142b3c4-d5e6-4789-8abc-def012345678',
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
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TutorProfileEditor', () => {
  it('shows the tutor collection before any form', () => {
    render(<TutorProfileEditor tutors={[tutor]} onChanged={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '选择导师' })).toBeTruthy()
    expect(screen.queryByLabelText('论文教学策略')).toBeNull()
    expect(screen.getByRole('button', { name: '编辑 苏格拉底导师' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '新增导师' })).toBeTruthy()
  })

  it('opens a dedicated scrollable detail containing every strategy field', async () => {
    render(<TutorProfileEditor tutors={[tutor]} onChanged={vi.fn()} onDirtyChange={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: '编辑 苏格拉底导师' }))
    const detail = screen.getByTestId('settings-detail-scroll')
    expect(detail.className).toContain('settings-detail-scroll')
    expect(screen.getByLabelText('书籍教学策略')).toBeTruthy()
    expect(screen.getByLabelText('论文教学策略')).toBeTruthy()
    expect(screen.getByLabelText('自定义要求')).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存导师' })).toBeTruthy()
  })

  it('uses the vector file picker instead of visible native file chrome', async () => {
    render(<TutorProfileEditor tutors={[tutor]} onChanged={vi.fn()} onDirtyChange={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: '编辑 苏格拉底导师' }))
    expect(screen.getByRole('button', { name: '选择导师头像' })).toBeTruthy()
    expect(screen.getByLabelText('选择导师头像 文件输入').className).toContain(
      'visually-hidden-file-input',
    )
  })
})
