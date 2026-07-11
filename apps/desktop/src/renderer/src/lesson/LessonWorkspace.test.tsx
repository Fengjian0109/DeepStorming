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
      modelRunId: '00000000-0000-4000-8000-000000000501',
      role: 'tutor' as const,
      content: '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  modelRuns: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId: '00000000-0000-4000-8000-000000000101',
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_first_question' as const,
      status: 'succeeded' as const,
      promptManifest: {
        key: 'lesson.mockTutor.firstQuestion',
        version: 1,
        hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
      },
      inputSummary: {
        documentId: '00000000-0000-4000-8000-000000000201',
        documentTitle: 'Paper Map',
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000401',
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const repliedSession = {
  ...session,
  messages: [
    ...session.messages,
    {
      id: '00000000-0000-4000-8000-000000000402',
      lessonId: session.id,
      modelRunId: null,
      role: 'learner' as const,
      content: '它在说明证据如何支撑判断。',
      sourceAnchorIds: [],
      promptVersion: 'learner-input-v1',
      createdAt: '2026-07-11T00:01:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000403',
      lessonId: session.id,
      modelRunId: '00000000-0000-4000-8000-000000000502',
      role: 'tutor' as const,
      content:
        '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来：下一步你会如何验证这个判断？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-follow-up-v1',
      createdAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  modelRuns: [
    ...session.modelRuns,
    {
      id: '00000000-0000-4000-8000-000000000502',
      lessonId: session.id,
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_follow_up' as const,
      status: 'succeeded' as const,
      promptManifest: {
        key: 'lesson.mockTutor.followUp',
        version: 1,
        hash: 'sha256:e9fdc89091ea362a238d87daa6f1fd75a8866698de8a9094e786414f5d3863f8',
      },
      inputSummary: {
        documentId: session.documentId,
        documentTitle: session.documentTitle,
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        learnerReplyCharacterCount: 13,
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000403',
      startedAt: '2026-07-11T00:01:00.000Z',
      finishedAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  updatedAt: '2026-07-11T00:01:00.000Z',
}

const failedSession = {
  ...repliedSession,
  messages: repliedSession.messages.filter(
    (message) => message.id !== '00000000-0000-4000-8000-000000000403',
  ),
  modelRuns: repliedSession.modelRuns.map((run) =>
    run.id === '00000000-0000-4000-8000-000000000502'
      ? { ...run, status: 'failed' as const, outputMessageId: null }
      : run,
  ),
}

const retriedSession = {
  ...failedSession,
  messages: [
    ...failedSession.messages,
    {
      id: '00000000-0000-4000-8000-000000000404',
      lessonId: session.id,
      modelRunId: '00000000-0000-4000-8000-000000000503',
      role: 'tutor' as const,
      content:
        '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来：下一步你会如何验证这个判断？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-follow-up-v1',
      createdAt: '2026-07-11T00:02:00.000Z',
    },
  ],
  modelRuns: [
    ...failedSession.modelRuns,
    {
      id: '00000000-0000-4000-8000-000000000503',
      lessonId: session.id,
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_follow_up' as const,
      status: 'succeeded' as const,
      promptManifest: {
        key: 'lesson.mockTutor.followUp',
        version: 1,
        hash: 'sha256:e9fdc89091ea362a238d87daa6f1fd75a8866698de8a9094e786414f5d3863f8',
      },
      inputSummary: {
        documentId: session.documentId,
        documentTitle: session.documentTitle,
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        learnerReplyCharacterCount: 13,
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000404',
      startedAt: '2026-07-11T00:02:00.000Z',
      finishedAt: '2026-07-11T00:02:00.000Z',
    },
  ],
  updatedAt: '2026-07-11T00:02:00.000Z',
}

beforeEach(() => {
  vi.stubGlobal('deepstorming', {
    lessons: {
      list: vi
        .fn()
        .mockResolvedValue({ ok: true, data: [session], requestId: crypto.randomUUID() }),
      get: vi.fn().mockResolvedValue({ ok: true, data: session, requestId: crypto.randomUUID() }),
      startFromDocument: vi.fn(),
      reply: vi
        .fn()
        .mockResolvedValue({ ok: true, data: repliedSession, requestId: crypto.randomUUID() }),
      retryRun: vi
        .fn()
        .mockResolvedValue({ ok: true, data: retriedSession, requestId: crypto.randomUUID() }),
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
    expect(screen.getByText('mock-local · succeeded')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '打开 Paper Map 课堂' }))
    await waitFor(() => expect(window.deepstorming.lessons.get).toHaveBeenCalledWith(session.id))
  })

  it('submits a learner reply and renders the deterministic tutor follow-up', async () => {
    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByText(/你觉得它想解决的核心问题是什么/)
    await user.type(screen.getByLabelText('你的回答'), '它在说明证据如何支撑判断。')
    await user.click(screen.getByRole('button', { name: '提交回答' }))

    await waitFor(() =>
      expect(window.deepstorming.lessons.reply).toHaveBeenCalledWith({
        lessonId: session.id,
        content: '它在说明证据如何支撑判断。',
      }),
    )
    expect(await screen.findByText('它在说明证据如何支撑判断。')).toBeTruthy()
    expect(await screen.findByText(/下一步你会如何验证这个判断/)).toBeTruthy()
    expect(screen.getByText('lesson.mockTutor.followUp v1')).toBeTruthy()
  })

  it('retries failed tutor runs from the run list', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [failedSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: failedSession, requestId: crypto.randomUUID() })
    render(<LessonWorkspace selectedLessonId={session.id} />)

    expect(await screen.findByText('mock-local · failed')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '重试生成 lesson.mockTutor.followUp v1' }))

    await waitFor(() =>
      expect(window.deepstorming.lessons.retryRun).toHaveBeenCalledWith({
        lessonId: session.id,
        modelRunId: '00000000-0000-4000-8000-000000000502',
      }),
    )
    expect(await screen.findByText(/下一步你会如何验证这个判断/)).toBeTruthy()
    expect(screen.getAllByText('lesson.mockTutor.followUp v1')).toHaveLength(2)
  })
})
