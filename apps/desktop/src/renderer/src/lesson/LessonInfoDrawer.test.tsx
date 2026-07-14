// @vitest-environment jsdom

import type { LessonSessionDto } from '@deepstorming/contracts'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LessonInfoDrawer } from './LessonInfoDrawer'

afterEach(() => cleanup())

const session = {
  id: 'lesson-1',
  title: '论文课堂',
  documentId: 'doc-1',
  documentTitle: '论文 A',
  status: 'active',
  currentState: 'probing',
  lessonMode: 'paper',
  paperProfile: { currentStage: 'method_intuition', stageSummary: '正在理解方法直觉。' },
  sourceAnchors: [
    {
      id: 'anchor-1',
      documentId: 'doc-1',
      startOffset: 10,
      endOffset: 30,
      snippet: '关键证据片段',
      target: { kind: 'pdf_block', pageNumber: 2, blockId: 'block-1', blockIndex: 3 },
    },
  ],
  messages: [],
  steps: [
    {
      id: 'step-1',
      modelRunId: 'run-1',
      actionType: 'ask',
      stateBefore: 'opening',
      stateAfter: 'probing',
    },
  ],
  modelRuns: [
    {
      id: 'run-1',
      modelName: 'deepseek-chat',
      status: 'succeeded',
      promptManifest: { key: 'lesson.tutor.followUp', version: 2 },
      inputSummary: {
        contextChunks: [
          { chunkId: 'chunk-1', pageNumberStart: 2, pageNumberEnd: 3, charCount: 420 },
        ],
      },
      errorSummary: null,
    },
  ],
  masteryEvidence: [
    {
      id: 'evidence-1',
      judgement: 'partial_understanding',
      confidence: 0.65,
      rationale: '已经理解主要关系。',
      suggestedReview: true,
      createdAt: '2026-07-14T00:03:00Z',
    },
  ],
  misconceptionSignals: [
    {
      id: 'signal-1',
      evidenceId: 'evidence-1',
      label: '混淆因果关系',
      severity: 'medium',
      rationale: '需要区分相关与因果。',
    },
  ],
  reviewItems: [
    {
      id: 'review-1',
      status: 'active',
      prompt: '请重新解释关键证据。',
      answerOutline: ['指出证据', '说明关系'],
      dueAt: '2026-07-15T00:00:00Z',
    },
  ],
  reviewEvents: [],
  createdAt: '2026-07-14T00:00:00Z',
  updatedAt: '2026-07-14T00:03:00Z',
} as unknown as LessonSessionDto

const callbacks = {
  onReturnToEvidence: vi.fn(),
  onReviewResponseChange: vi.fn(),
  onRecordReview: vi.fn(),
}

const Harness = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        课堂信息
      </button>
      <LessonInfoDrawer
        open={open}
        session={session}
        reviewResponses={{ 'review-1': '我的复习回答' }}
        reviewSavingId={null}
        reviewFeedback="复习记录已保存。"
        reviewError={null}
        onClose={() => setOpen(false)}
        {...callbacks}
      />
    </>
  )
}

describe('LessonInfoDrawer', () => {
  it('opens with focus, closes by Escape and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '课堂信息' })
    expect(screen.queryByRole('dialog', { name: '课堂信息' })).toBeNull()

    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: '课堂信息' })).toBeTruthy()
    await waitFor(() => expect(globalThis.document.activeElement?.textContent).toBe('课堂信息'))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '课堂信息' })).toBeNull()
    expect(globalThis.document.activeElement).toBe(trigger)
  })

  it('separates evidence, progress, diagnosis, review and technical information', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '课堂信息' }))

    for (const tab of ['证据', '进度', '诊断', '复习', '技术']) {
      expect(screen.getByRole('tab', { name: tab })).toBeTruthy()
    }
    expect(screen.getByText('关键证据片段')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '回到证据' }))
    expect(callbacks.onReturnToEvidence).toHaveBeenCalledWith({
      documentId: 'doc-1',
      pageNumber: 2,
      blockId: 'block-1',
    })

    await user.click(screen.getByRole('tab', { name: '进度' }))
    expect(screen.getByText(/苏格拉底追问/)).toBeTruthy()
    expect(screen.getByText(/^论文阶段：方法直觉$/)).toBeTruthy()
    expect(screen.queryByText('关键证据片段')).toBeNull()

    await user.click(screen.getByRole('tab', { name: '诊断' }))
    expect(screen.getByText(/部分理解.*65%/)).toBeTruthy()
    expect(screen.getByText(/混淆因果关系/)).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: '复习' }))
    expect(screen.getByText('请重新解释关键证据。')).toBeTruthy()
    expect(screen.getByDisplayValue('我的复习回答')).toBeTruthy()
    expect(screen.getByText('复习记录已保存。')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '记住了' }))
    expect(callbacks.onRecordReview).toHaveBeenCalledWith('review-1', 'remembered')

    await user.click(screen.getByRole('tab', { name: '技术' }))
    expect(screen.getByText(/deepseek-chat.*succeeded/)).toBeTruthy()
    expect(screen.getByText(/opening.*probing/)).toBeTruthy()
    expect(screen.getByText(/第 2-3 页.*420 字/)).toBeTruthy()
    expect(screen.getByText(/lesson.tutor.followUp v2/)).toBeTruthy()
  })

  it('closes from its explicit close action', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '课堂信息' }))
    await user.click(screen.getByRole('button', { name: '关闭课堂信息' }))
    expect(screen.queryByRole('dialog', { name: '课堂信息' })).toBeNull()
  })
})
