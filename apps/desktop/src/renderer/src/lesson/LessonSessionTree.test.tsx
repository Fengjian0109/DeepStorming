// @vitest-environment jsdom

import type { LessonSessionDto } from '@deepstorming/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { groupLessonSessions, LessonSessionTree } from './LessonSessionTree'

const makeSession = (
  id: string,
  documentId: string,
  documentTitle: string,
  title: string,
  updatedAt: string,
  status: LessonSessionDto['status'] = 'active',
): LessonSessionDto =>
  ({
    id,
    documentId,
    documentTitle,
    title,
    updatedAt,
    createdAt: updatedAt,
    status,
    sourceAnchors: [],
    messages: [],
    modelRuns: [],
    currentState: status === 'archived' ? 'completed' : 'probing',
    steps: [],
    masteryEvidence: [],
    misconceptionSignals: [],
    reviewItems: [],
    reviewEvents: [],
    lessonMode: 'standard',
    paperProfile: null,
  }) as LessonSessionDto

const sessions = [
  makeSession('lesson-old', 'doc-b', '教材 B', '第一节', '2026-07-10T00:00:00.000Z'),
  makeSession('lesson-new', 'doc-b', '教材 B', '第二节', '2026-07-12T00:00:00.000Z'),
  makeSession(
    'lesson-archived',
    'doc-a',
    '教材 A',
    '已完成课程',
    '2026-07-11T00:00:00.000Z',
    'archived',
  ),
]

describe('LessonSessionTree', () => {
  it('groups by document deterministically and sorts sessions newest first', () => {
    const groups = groupLessonSessions(sessions)

    expect(groups.map((group) => group.documentTitle)).toEqual(['教材 A', '教材 B'])
    expect(groups[1]?.sessions.map((session) => session.title)).toEqual(['第二节', '第一节'])
  })

  it('renders one document heading, selection, status and selection callback', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <LessonSessionTree sessions={sessions} selectedLessonId="lesson-new" onSelect={onSelect} />,
    )

    expect(screen.getAllByText('教材 A')).toHaveLength(1)
    expect(screen.getAllByText('教材 B')).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /第二节.*进行中/ }).getAttribute('aria-current'),
    ).toBe('page')
    await user.click(screen.getByText('教材 A'))
    expect(screen.getByRole('button', { name: /已完成课程.*已归档/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /第一节.*进行中/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('lesson-old')
  })

  it('renders useful empty, loading and error states with retry affordances', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <LessonSessionTree sessions={[]} onSelect={vi.fn()} state="empty" onRetry={retry} />,
    )
    expect(screen.getByText('还没有课堂记录。')).toBeTruthy()

    rerender(<LessonSessionTree sessions={[]} onSelect={vi.fn()} state="loading" onRetry={retry} />)
    expect(screen.getByText('正在加载课堂…')).toBeTruthy()

    rerender(
      <LessonSessionTree
        sessions={[]}
        onSelect={vi.fn()}
        state="error"
        errorMessage="课堂加载失败。"
        onRetry={retry}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('课堂加载失败。')
    await user.click(screen.getByRole('button', { name: '重试加载' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
