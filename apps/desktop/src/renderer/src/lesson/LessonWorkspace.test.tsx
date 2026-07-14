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
        contextCharacterCount: 312,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000601',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 312,
          },
        ],
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000401',
      errorSummary: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  currentState: 'probing' as const,
  steps: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId: '00000000-0000-4000-8000-000000000101',
      sequenceNo: 0,
      stateBefore: 'opening' as const,
      stateAfter: 'probing' as const,
      actionType: 'ask' as const,
      status: 'succeeded' as const,
      modelRunId: '00000000-0000-4000-8000-000000000501',
      messageId: '00000000-0000-4000-8000-000000000401',
      rationale: 'Started with a source-grounded opening question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  masteryEvidence: [],
  misconceptionSignals: [],
  reviewItems: [],
  reviewEvents: [],
  lessonMode: 'standard' as const,
  paperProfile: null,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const paperSession = {
  ...session,
  id: '00000000-0000-4000-8000-000000000111',
  title: 'Paper Map 论文课堂',
  lessonMode: 'paper' as const,
  paperProfile: {
    currentStage: 'problem_framing' as const,
    stageSummary: 'The learner is still orienting around the paper.',
  },
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
        contextCharacterCount: 186,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000602',
            pageNumberStart: 2,
            pageNumberEnd: 3,
            charCount: 186,
          },
        ],
        learnerReplyCharacterCount: 13,
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000403',
      errorSummary: null,
      startedAt: '2026-07-11T00:01:00.000Z',
      finishedAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  currentState: 'probing' as const,
  steps: [
    ...session.steps,
    {
      id: '00000000-0000-4000-8000-000000000502',
      lessonId: session.id,
      sequenceNo: 1,
      stateBefore: 'probing' as const,
      stateAfter: 'probing' as const,
      actionType: 'ask' as const,
      status: 'succeeded' as const,
      modelRunId: '00000000-0000-4000-8000-000000000502',
      messageId: '00000000-0000-4000-8000-000000000403',
      rationale: 'Continue probing with source-grounded question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:01:00.000Z',
      finishedAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  masteryEvidence: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      lessonId: session.id,
      stepId: '00000000-0000-4000-8000-000000000502',
      learnerMessageId: '00000000-0000-4000-8000-000000000402',
      tutorMessageId: '00000000-0000-4000-8000-000000000403',
      kind: 'teach_back' as const,
      judgement: 'partial_understanding' as const,
      confidence: 0.55,
      rationale: 'Learner gave a source-grounded answer that can support follow-up.',
      suggestedReview: false,
      createdAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  misconceptionSignals: [],
  updatedAt: '2026-07-11T00:01:00.000Z',
}

const stuckSession = {
  ...repliedSession,
  masteryEvidence: [
    ...repliedSession.masteryEvidence,
    {
      id: '00000000-0000-4000-8000-000000000702',
      lessonId: session.id,
      stepId: '00000000-0000-4000-8000-000000000502',
      learnerMessageId: '00000000-0000-4000-8000-000000000402',
      tutorMessageId: '00000000-0000-4000-8000-000000000403',
      kind: 'stuck_signal' as const,
      judgement: 'needs_review' as const,
      confidence: 0.75,
      rationale: 'Learner explicitly signaled they are stuck or unsure.',
      suggestedReview: true,
      createdAt: '2026-07-11T00:02:00.000Z',
    },
  ],
  misconceptionSignals: [
    {
      id: '00000000-0000-4000-8000-000000000801',
      evidenceId: '00000000-0000-4000-8000-000000000702',
      lessonId: session.id,
      label: '学习者表达卡住',
      severity: 'medium' as const,
      rationale: 'Learner used language that indicates confusion or being stuck.',
      createdAt: '2026-07-11T00:02:00.000Z',
    },
  ],
  reviewItems: [
    {
      id: '00000000-0000-4000-8000-000000000951',
      lessonId: session.id,
      masteryEvidenceId: '00000000-0000-4000-8000-000000000702',
      misconceptionSignalId: '00000000-0000-4000-8000-000000000801',
      prompt: '复习：学习者表达卡住。请重新解释这段证据想说明什么。',
      answerOutline: [
        'Learner explicitly signaled they are stuck or unsure.',
        'Learner used language that indicates confusion or being stuck.',
      ],
      status: 'active' as const,
      dueAt: '2026-07-12T00:00:00.000Z',
      createdAt: '2026-07-11T00:02:00.000Z',
      updatedAt: '2026-07-11T00:02:00.000Z',
    },
  ],
  reviewEvents: [],
}

const failedSession = {
  ...repliedSession,
  messages: repliedSession.messages.filter(
    (message) => message.id !== '00000000-0000-4000-8000-000000000403',
  ),
  modelRuns: repliedSession.modelRuns.map((run) =>
    run.id === '00000000-0000-4000-8000-000000000502'
      ? {
          ...run,
          status: 'failed' as const,
          outputMessageId: null,
          errorSummary: {
            code: 'INTERNAL_ERROR',
            message: 'The lesson operation could not be completed.',
            retryable: true,
          },
        }
      : run,
  ),
  steps: repliedSession.steps.map((step) =>
    step.modelRunId === '00000000-0000-4000-8000-000000000502'
      ? {
          ...step,
          stateAfter: 'probing' as const,
          status: 'failed' as const,
          messageId: null,
          rationale: null,
          errorSummary: 'The lesson operation could not be completed.',
        }
      : step,
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
        contextCharacterCount: 186,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000603',
            pageNumberStart: 2,
            pageNumberEnd: 3,
            charCount: 186,
          },
        ],
        learnerReplyCharacterCount: 13,
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000404',
      errorSummary: null,
      startedAt: '2026-07-11T00:02:00.000Z',
      finishedAt: '2026-07-11T00:02:00.000Z',
    },
  ],
  steps: [
    ...failedSession.steps,
    {
      id: '00000000-0000-4000-8000-000000000503',
      lessonId: session.id,
      sequenceNo: 2,
      stateBefore: 'probing' as const,
      stateAfter: 'probing' as const,
      actionType: 'ask' as const,
      status: 'succeeded' as const,
      modelRunId: '00000000-0000-4000-8000-000000000503',
      messageId: '00000000-0000-4000-8000-000000000404',
      rationale: 'Continue probing with source-grounded question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:02:00.000Z',
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
      cancelRun: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { cancelled: true }, requestId: crypto.randomUUID() }),
      recordReview: vi
        .fn()
        .mockResolvedValue({ ok: true, data: stuckSession, requestId: crypto.randomUUID() }),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LessonWorkspace', () => {
  it('renders paper stage and summary for paper lessons', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [paperSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: paperSession, requestId: crypto.randomUUID() })

    render(<LessonWorkspace selectedLessonId={paperSession.id} />)

    expect(await screen.findByRole('heading', { name: 'Paper Map 论文课堂' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('tab', { name: '进度' }))
    expect(screen.getByText(/论文阶段：问题定位/)).toBeTruthy()
    expect(screen.getByText('The learner is still orienting around the paper.')).toBeTruthy()
  })

  it('does not render paper metadata for standard lessons', async () => {
    render(<LessonWorkspace selectedLessonId={session.id} />)

    expect(await screen.findByRole('heading', { name: 'Paper Map 课堂' })).toBeTruthy()
    expect(screen.queryByText('问题定位')).toBeNull()
  })

  it('lists lesson sessions and opens a selected session', async () => {
    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    expect(await screen.findByRole('heading', { name: 'Paper Map 课堂' })).toBeTruthy()
    expect(screen.getByText(/你觉得它想解决的核心问题是什么/)).toBeTruthy()
    expect(screen.getByText('当前阶段：苏格拉底追问')).toBeTruthy()
    const conversation = screen.getByRole('log', { name: '课堂消息' })
    expect(conversation.className).toContain('lesson-conversation')
    expect(conversation.contains(screen.getByLabelText('你的回答'))).toBe(false)
    expect(screen.getByLabelText('你的回答').closest('.lesson-composer')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '生成记录' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '学习诊断' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '复习任务' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    expect(screen.getByText('Evidence')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: '技术' }))
    expect(screen.getByText('mock-local · succeeded')).toBeTruthy()
    expect(screen.getByText(/ask.*opening.*probing/)).toBeTruthy()
    expect(screen.getByText('第 1 页 · 312 字')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Paper Map 课堂 · 进行中' }))
    await waitFor(() => expect(window.deepstorming.lessons.get).toHaveBeenCalledWith(session.id))
  })

  it('shows PDF provenance and returns to the selected evidence block', async () => {
    const user = userEvent.setup()
    const pdfSession = {
      ...session,
      sourceAnchors: [
        {
          ...session.sourceAnchors[0],
          target: {
            kind: 'pdf_block' as const,
            pageNumber: 2,
            blockId: '00000000-0000-4000-8000-000000000302',
            blockIndex: 1,
          },
        },
      ],
    }
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [pdfSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: pdfSession, requestId: crypto.randomUUID() })
    const onReturnToEvidence = vi.fn()
    render(
      <LessonWorkspace selectedLessonId={session.id} onReturnToEvidence={onReturnToEvidence} />,
    )

    await screen.findByRole('heading', { name: 'Paper Map 课堂' })
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    expect(screen.getByText('第 2 页 · Block 2')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '回到证据' }))
    expect(onReturnToEvidence).toHaveBeenCalledWith({
      documentId: session.documentId,
      pageNumber: 2,
      blockId: '00000000-0000-4000-8000-000000000302',
    })
  })

  it('submits a learner reply and renders the deterministic tutor follow-up', async () => {
    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByText(/你觉得它想解决的核心问题是什么/)
    await user.type(screen.getByLabelText('你的回答'), '它在说明证据如何支撑判断。')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(window.deepstorming.lessons.reply).toHaveBeenCalledWith({
        lessonId: session.id,
        content: '它在说明证据如何支撑判断。',
        operationId: expect.any(String),
      }),
    )
    expect(await screen.findByText('它在说明证据如何支撑判断。')).toBeTruthy()
    expect(await screen.findByText(/下一步你会如何验证这个判断/)).toBeTruthy()
    expect((screen.getByLabelText('你的回答') as HTMLTextAreaElement).value).toBe('')
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('tab', { name: '诊断' }))
    expect(screen.getByText('部分理解 · 55%')).toBeTruthy()
    expect(
      screen.getByText('Learner gave a source-grounded answer that can support follow-up.'),
    ).toBeTruthy()
  })

  it('keeps historical sessions readable before step records exist', async () => {
    const legacySession = { ...session, steps: [], masteryEvidence: [], misconceptionSignals: [] }
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [legacySession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: legacySession, requestId: crypto.randomUUID() })

    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByRole('heading', { name: 'Paper Map 课堂' })
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('tab', { name: '诊断' }))
    expect(screen.getByText('还没有学习诊断。')).toBeTruthy()
  })

  it('shows matching misconception signals and suggested review for the latest diagnosis', async () => {
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [stuckSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: stuckSession, requestId: crypto.randomUUID() })

    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByRole('heading', { name: 'Paper Map 课堂' })
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('tab', { name: '诊断' }))
    expect(await screen.findByText('建议复习 · 75%')).toBeTruthy()
    expect(screen.getByText('Learner explicitly signaled they are stuck or unsure.')).toBeTruthy()
    expect(screen.getByText('学习者表达卡住')).toBeTruthy()
    expect(
      screen.getByText('Learner used language that indicates confusion or being stuck.'),
    ).toBeTruthy()
  })

  it('renders review tasks and records remembered reviews', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [stuckSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: stuckSession, requestId: crypto.randomUUID() })
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByRole('heading', { name: 'Paper Map 课堂' })
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('tab', { name: '复习' }))
    expect(screen.getByText('复习：学习者表达卡住。请重新解释这段证据想说明什么。')).toBeTruthy()
    await user.type(screen.getByLabelText('这次复习回答'), '我已经能解释证据和判断依据。')
    await user.click(screen.getByRole('button', { name: '记住了' }))

    await waitFor(() =>
      expect(window.deepstorming.lessons.recordReview).toHaveBeenCalledWith({
        lessonId: session.id,
        reviewItemId: '00000000-0000-4000-8000-000000000951',
        rating: 'remembered',
        response: '我已经能解释证据和判断依据。',
      }),
    )
    expect(await screen.findByText('复习记录已保存。')).toBeTruthy()
  })

  it('shows snippet fallback when a lesson run has no retrieval chunks', async () => {
    const degradedSession = {
      ...session,
      modelRuns: session.modelRuns.map((run) => ({
        ...run,
        inputSummary: {
          ...run.inputSummary,
          contextCharacterCount: 0,
          contextChunks: [],
        },
      })),
    }
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [degradedSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: degradedSession, requestId: crypto.randomUUID() })

    const user = userEvent.setup()
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByRole('heading', { name: 'Paper Map 课堂' })
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('tab', { name: '技术' }))
    expect(await screen.findByText('课堂仍可继续（已降级为 snippet）')).toBeTruthy()
  })

  it('cancels an in-flight learner reply generation', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.reply = vi.fn().mockReturnValue(new Promise(() => undefined))
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByText(/你觉得它想解决的核心问题是什么/)
    await user.type(screen.getByLabelText('你的回答'), '它在说明证据如何支撑判断。')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await user.click(await screen.findByRole('button', { name: '取消生成' }))

    const operationId = vi.mocked(window.deepstorming.lessons.reply).mock.calls[0]?.[0].operationId
    expect(operationId).toEqual(expect.any(String))
    expect(window.deepstorming.lessons.cancelRun).toHaveBeenCalledWith(operationId)
    expect(await screen.findByText('生成已取消。')).toBeTruthy()
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

    expect(await screen.findByText('The lesson operation could not be completed.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '重试生成 lesson.mockTutor.followUp v1' }))

    await waitFor(() =>
      expect(window.deepstorming.lessons.retryRun).toHaveBeenCalledWith({
        lessonId: session.id,
        modelRunId: '00000000-0000-4000-8000-000000000502',
        operationId: expect.any(String),
      }),
    )
    expect(await screen.findByText(/下一步你会如何验证这个判断/)).toBeTruthy()
  })

  it('cancels an in-flight retry generation', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [failedSession], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi
      .fn()
      .mockResolvedValue({ ok: true, data: failedSession, requestId: crypto.randomUUID() })
    window.deepstorming.lessons.retryRun = vi.fn().mockReturnValue(new Promise(() => undefined))
    render(<LessonWorkspace selectedLessonId={session.id} />)

    expect(await screen.findByText('The lesson operation could not be completed.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '重试生成 lesson.mockTutor.followUp v1' }))
    await user.click(await screen.findByRole('button', { name: '取消重试' }))

    const operationId = vi.mocked(window.deepstorming.lessons.retryRun).mock.calls[0]?.[0]
      .operationId
    expect(operationId).toEqual(expect.any(String))
    expect(window.deepstorming.lessons.cancelRun).toHaveBeenCalledWith(operationId)
    expect(await screen.findByText('生成已取消。')).toBeTruthy()
  })

  it('preserves the draft and exposes provider failures without local tutor output', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.reply = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'AI Provider 暂不可用，请检查设置。',
        retryable: true,
      },
      requestId: crypto.randomUUID(),
    })
    render(<LessonWorkspace selectedLessonId={session.id} />)

    await screen.findByRole('heading', { name: 'Paper Map 课堂' })
    await user.type(screen.getByLabelText('你的回答'), '保留这段回答')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'AI Provider 暂不可用，请检查设置。',
    )
    expect((screen.getByLabelText('你的回答') as HTMLTextAreaElement).value).toBe('保留这段回答')
    expect(screen.queryByText(/本地导师/)).toBeNull()
  })

  it('offers retries for list and detail load failures', async () => {
    const user = userEvent.setup()
    window.deepstorming.lessons.list = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '课堂列表加载失败。', retryable: true },
      requestId: crypto.randomUUID(),
    })
    const { unmount } = render(<LessonWorkspace selectedLessonId={session.id} />)
    expect((await screen.findByRole('alert')).textContent).toContain('课堂列表加载失败。')
    expect(screen.getByRole('button', { name: '重试加载' })).toBeTruthy()
    unmount()

    window.deepstorming.lessons.list = vi
      .fn()
      .mockResolvedValue({ ok: true, data: [session], requestId: crypto.randomUUID() })
    window.deepstorming.lessons.get = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '课堂详情加载失败。', retryable: true },
      requestId: crypto.randomUUID(),
    })
    render(<LessonWorkspace selectedLessonId={session.id} />)
    expect((await screen.findByRole('alert')).textContent).toContain('课堂详情加载失败。')
    await user.click(screen.getByRole('button', { name: '重试课堂详情' }))
    expect(window.deepstorming.lessons.get).toHaveBeenCalledTimes(2)
  })
})
