// @vitest-environment jsdom

import type { DeepStormingBootstrapApi, LessonSessionDto } from '@deepstorming/contracts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LessonConversation } from './LessonConversation'

afterEach(() => cleanup())

const baseSession = {
  id: 'lesson-1',
  title: '第一节',
  status: 'active',
  documentId: 'doc-1',
  documentTitle: '教材',
  sourceAnchors: [],
  messages: [
    { id: 'm1', role: 'system', content: '课堂已开始', createdAt: '2026-07-14T00:00:00Z' },
    { id: 'm2', role: 'tutor', content: '你如何理解这个概念？', createdAt: '2026-07-14T00:01:00Z' },
    { id: 'm3', role: 'learner', content: '我认为它表示映射。', createdAt: '2026-07-14T00:02:00Z' },
  ],
  modelRuns: [],
  currentState: 'probing',
  steps: [],
  masteryEvidence: [],
  misconceptionSignals: [],
  reviewItems: [],
  reviewEvents: [],
  lessonMode: 'standard',
  paperProfile: null,
  createdAt: '2026-07-14T00:00:00Z',
  updatedAt: '2026-07-14T00:02:00Z',
} as unknown as LessonSessionDto

describe('LessonConversation', () => {
  it('renders persisted messages in order with distinct accessible roles only', () => {
    render(
      <LessonConversation session={baseSession} onRetryRun={vi.fn()} onCancelRetry={vi.fn()} />,
    )

    expect(screen.getByRole('article', { name: '系统消息' }).textContent).toContain('课堂已开始')
    expect(screen.getByRole('article', { name: '导师消息' }).textContent).toContain(
      '你如何理解这个概念？',
    )
    expect(screen.getByRole('article', { name: '学习者消息' }).textContent).toContain(
      '我认为它表示映射。',
    )
    expect(screen.getAllByRole('article').map((element) => element.textContent?.trim())).toEqual([
      '课堂已开始系统',
      '你如何理解这个概念？导师',
      '我认为它表示映射。学习者',
    ])
    expect(screen.queryByRole('heading', { name: '生成记录' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '学习诊断' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '复习任务' })).toBeNull()
  })

  it('renders structured tutor narration and Markdown while keeping learner LaTeX rich', () => {
    render(
      <LessonConversation
        session={
          {
            ...baseSession,
            messages: [
              {
                ...baseSession.messages[1],
                tutorTurn: {
                  narration: '她指向公式。',
                  responseMarkdown: '为什么 **梯度** 是 $\\nabla f$？',
                  citations: [],
                  figureReferences: [],
                },
              },
              { ...baseSession.messages[2], content: '因为 $f(x)=x^2$。' },
            ],
          } as LessonSessionDto
        }
        onRetryRun={vi.fn()}
        onCancelRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('她指向公式。').tagName).toBe('EM')
    expect(screen.getByText('梯度').tagName).toBe('STRONG')
    expect(document.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('renders verified citation cards and returns to PDF evidence without changing chat scroll', async () => {
    const onReturnToEvidence = vi.fn()
    const user = userEvent.setup()
    render(
      <LessonConversation
        session={
          {
            ...baseSession,
            sourceAnchors: [
              {
                id: 'anchor-1',
                documentId: 'doc-1',
                startOffset: 0,
                endOffset: 8,
                snippet: 'Evidence',
                target: { kind: 'pdf_block', pageNumber: 4, blockId: 'block-4', blockIndex: 0 },
              },
            ],
            messages: [
              {
                ...baseSession.messages[1],
                sourceAnchorIds: ['anchor-1'],
                tutorTurn: {
                  narration: null,
                  responseMarkdown: '请检查证据。',
                  citations: [
                    {
                      chunkId: 'chunk-1',
                      quote: 'Evidence',
                      rationale: '直接证据',
                      pageNumberStart: 4,
                      pageNumberEnd: 4,
                    },
                  ],
                  figureReferences: [],
                },
              },
            ],
          } as LessonSessionDto
        }
        onRetryRun={vi.fn()}
        onCancelRetry={vi.fn()}
        onReturnToEvidence={onReturnToEvidence}
      />,
    )
    const scroller = screen.getByRole('log', { name: '课堂消息' })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: 180 })

    await user.click(screen.getByRole('button', { name: '回到来源' }))
    expect(onReturnToEvidence).toHaveBeenCalledWith({
      documentId: 'doc-1',
      pageNumber: 4,
      blockId: 'block-4',
    })
    expect(scroller.scrollTop).toBe(180)
  })

  it('loads verified figure references and returns to their PDF page', async () => {
    const documentId = '00000000-0000-4000-8000-000000000201'
    const figureId = '00000000-0000-4000-8000-000000000301'
    const getFigureAsset = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        figure: {
          id: figureId,
          documentId,
          pageNumber: 5,
          label: '图 3',
          caption: '模型结构',
          assetId: '00000000-0000-4000-8000-000000000401',
          assetKind: 'page_render',
          width: 612,
          height: 792,
          createdAt: '2026-07-14T00:00:00.000Z',
        },
        mediaType: 'image/png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
      requestId: '00000000-0000-4000-8000-000000000001',
    })
    Object.defineProperty(window, 'deepstorming', {
      configurable: true,
      value: { documents: { getFigureAsset } } as unknown as DeepStormingBootstrapApi,
    })
    const onReturnToEvidence = vi.fn()
    const user = userEvent.setup()

    render(
      <LessonConversation
        session={
          {
            ...baseSession,
            documentId,
            messages: [
              {
                ...baseSession.messages[1],
                tutorTurn: {
                  narration: null,
                  responseMarkdown: '观察这张结构图。',
                  citations: [],
                  figureReferences: [{ figureId, rationale: '用于定位模块关系' }],
                },
              },
            ],
          } as LessonSessionDto
        }
        onRetryRun={vi.fn()}
        onCancelRetry={vi.fn()}
        onReturnToEvidence={onReturnToEvidence}
      />,
    )

    expect(await screen.findByRole('img', { name: '图 3：模型结构' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '回到图片来源' }))
    expect(onReturnToEvidence).toHaveBeenCalledWith({ documentId, pageNumber: 5 })
  })

  it('renders a useful empty state', () => {
    render(
      <LessonConversation
        session={{ ...baseSession, messages: [] }}
        onRetryRun={vi.fn()}
        onCancelRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('这节课还没有对话，导师正在准备第一个问题。')).toBeTruthy()
  })

  it('renders failed run recovery after messages and supports retry cancellation', async () => {
    const retry = vi.fn()
    const cancel = vi.fn()
    const user = userEvent.setup()
    const failedRun = {
      id: 'run-1',
      status: 'failed',
      modelName: 'deepseek-chat',
      promptManifest: { key: 'lesson.tutor.followUp', version: 2 },
      errorSummary: { message: '模型暂时不可用。' },
      startedAt: '2026-07-14T00:03:00Z',
    }
    const { rerender } = render(
      <LessonConversation
        session={{ ...baseSession, modelRuns: [failedRun] } as LessonSessionDto}
        onRetryRun={retry}
        onCancelRetry={cancel}
      />,
    )

    const recovery = screen.getByRole('article', { name: '生成失败' })
    expect(recovery.textContent).toContain('lesson.tutor.followUp v2')
    expect(recovery.textContent).toContain('模型暂时不可用。')
    expect(screen.getAllByRole('article').at(-1)).toBe(recovery)
    await user.click(screen.getByRole('button', { name: /重试生成/ }))
    expect(retry).toHaveBeenCalledWith('run-1')

    rerender(
      <LessonConversation
        session={{ ...baseSession, modelRuns: [failedRun] } as LessonSessionDto}
        retryingModelRunId="run-1"
        onRetryRun={retry}
        onCancelRetry={cancel}
      />,
    )
    await user.click(screen.getByRole('button', { name: '取消重试' }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('hides a historical failed run after a newer retry succeeds', () => {
    const failedRun = {
      id: 'run-1',
      status: 'failed',
      promptManifest: { key: 'lesson.tutor.followUp', version: 2 },
      errorSummary: { message: '模型暂时不可用。' },
    }
    const succeededRetry = {
      ...failedRun,
      id: 'run-2',
      status: 'succeeded',
      errorSummary: null,
    }

    render(
      <LessonConversation
        session={{ ...baseSession, modelRuns: [failedRun, succeededRetry] } as LessonSessionDto}
        onRetryRun={vi.fn()}
        onCancelRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('article', { name: '生成失败' })).toBeNull()
    expect(screen.queryByRole('button', { name: /重试生成/ })).toBeNull()
  })

  it('auto-scrolls only near the bottom and otherwise offers a new-message action', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <LessonConversation session={baseSession} onRetryRun={vi.fn()} onCancelRetry={vi.fn()} />,
    )
    const scroller = screen.getByRole('log', { name: '课堂消息' })
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    })
    fireEvent.scroll(scroller)

    rerender(
      <LessonConversation
        session={
          {
            ...baseSession,
            messages: [
              ...baseSession.messages,
              { id: 'm4', role: 'tutor', content: '新问题', createdAt: '2026-07-14T00:03:00Z' },
            ],
          } as LessonSessionDto
        }
        onRetryRun={vi.fn()}
        onCancelRetry={vi.fn()}
      />,
    )
    expect(scroller.scrollTop).toBe(100)
    expect(screen.getByRole('button', { name: '有新消息' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '有新消息' }))
    expect(scroller.scrollTop).toBe(1000)
  })
})
