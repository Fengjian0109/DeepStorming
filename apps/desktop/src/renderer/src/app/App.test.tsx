// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../document/DocumentLibrary', async () => {
  const ReactModule = await import('react')
  return {
    DocumentLibrary: ({ onLessonStarted }: { onLessonStarted?: (lessonId: string) => void }) =>
      ReactModule.createElement(
        'section',
        null,
        ReactModule.createElement('p', null, '文档页内容'),
        ReactModule.createElement(
          'button',
          { type: 'button', onClick: () => onLessonStarted?.('lesson-123') },
          '启动测试课堂',
        ),
      ),
  }
})

vi.mock('../lesson/LessonWorkspace', async () => {
  const ReactModule = await import('react')
  return {
    LessonWorkspace: ({ selectedLessonId }: { selectedLessonId?: string }) =>
      ReactModule.createElement(
        'section',
        null,
        ReactModule.createElement('p', null, '课堂页内容'),
        ReactModule.createElement('p', null, '已选择：' + (selectedLessonId ?? '无')),
      ),
  }
})

vi.mock('../settings/SettingsCenter', async () => {
  const ReactModule = await import('react')
  return {
    SettingsCenter: () => ReactModule.createElement('section', null, '模型与 Provider 设置'),
  }
})

import { App } from './App'

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('React', React)
  vi.stubGlobal('deepstorming', {
    app: {
      getInfo: vi.fn().mockResolvedValue({
        ok: true,
        data: { version: '1.2.3', platform: 'darwin' },
        requestId: crypto.randomUUID(),
      }),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App workspace composition', () => {
  it('starts in the document library with runtime status and document context', async () => {
    render(<App />)

    expect(await screen.findByText('文档页内容')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: '文档导航' })).toBeTruthy()
    expect((await screen.findByTestId('app-version')).textContent).toBe('v1.2.3 · darwin')
  })

  it('switches the main and contextual regions together', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '课堂' }))
    expect(screen.getByText('课堂页内容')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: '课堂与课程记录' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByText('模型与 Provider 设置')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: '设置分类' })).toBeTruthy()
  })

  it('opens a newly started lesson in the classroom', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '启动测试课堂' }))

    expect(screen.getByText('课堂页内容')).toBeTruthy()
    expect(screen.getByText('已选择：lesson-123')).toBeTruthy()
  })
})
