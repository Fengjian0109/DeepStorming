// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LessonWorkspace } from './LessonWorkspace'

const session = {
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Paper Map 课堂',
  status: 'active' as const,
  documentId: '00000000-0000-4000-8000-000000000201',
  documentTitle: 'Paper Map',
  sourceAnchors: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      documentId: '00000000-0000-4000-8000-000000000201',
      startOffset: 4,
      endOffset: 12,
      snippet: 'Evidence',
    },
  ],
  messages: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      lessonId: '00000000-0000-4000-8000-000000000101',
      role: 'tutor' as const,
      content: '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

beforeEach(() => {
  vi.stubGlobal('deepstorming', {
    lessons: {
      list: vi
        .fn()
        .mockResolvedValue({ ok: true, data: [session], requestId: crypto.randomUUID() }),
      get: vi.fn().mockResolvedValue({ ok: true, data: session, requestId: crypto.randomUUID() }),
      startFromDocument: vi.fn(),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LessonWorkspace', () => {
  it('lists lesson sessions and opens a selected session', async () => {
    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    expect(await screen.findByRole('heading', { name: '课堂' })).toBeTruthy()
    expect(await screen.findAllByRole('heading', { name: 'Paper Map 课堂' })).toHaveLength(2)
    expect(screen.getByText('Evidence')).toBeTruthy()
    expect(screen.getByText(/你觉得它想解决的核心问题是什么/)).toBeTruthy()
    expect(
      screen.getByText((_content, node) => node?.textContent === '导师 · Prompt mock-tutor-v1'),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '打开 Paper Map 课堂' }))
    await waitFor(() => expect(window.deepstorming.lessons.get).toHaveBeenCalledWith(session.id))
  })
})
