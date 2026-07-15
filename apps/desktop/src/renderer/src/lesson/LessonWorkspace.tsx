import type { LessonSessionDto, LessonStateDto } from '@deepstorming/contracts'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { WorkspaceContextual } from '../app/WorkspaceShell'
import { LessonComposer } from './LessonComposer'
import { LessonConversation } from './LessonConversation'
import { LessonInfoDrawer } from './LessonInfoDrawer'
import { LessonSessionTree } from './LessonSessionTree'

type LessonListState =
  | { status: 'loading' }
  | { status: 'ready'; sessions: LessonSessionDto[] }
  | { status: 'error'; message: string }

type LessonDetailState =
  | { status: 'idle' }
  | { status: 'loading'; lessonId: string }
  | { status: 'ready'; session: LessonSessionDto }
  | { status: 'error'; lessonId: string; message: string }

type ReplyState =
  | { status: 'idle' }
  | { status: 'submitting'; operationId: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type RunRetryState =
  | { status: 'idle' }
  | { status: 'retrying'; modelRunId: string; operationId: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

const lessonStateLabels: Record<LessonStateDto, string> = {
  opening: '开场提问',
  probing: '苏格拉底追问',
  hinting: '提示阶梯',
  explaining: '短讲解',
  reflecting: '复述反思',
  summarizing: '阶段小结',
  completed: '已完成',
  paused: '已暂停',
  error: '待恢复',
}

const replaceSession = (
  sessions: readonly LessonSessionDto[],
  updated: LessonSessionDto,
): LessonSessionDto[] => sessions.map((session) => (session.id === updated.id ? updated : session))

export const LessonWorkspace = ({
  selectedLessonId,
  onReturnToEvidence,
}: {
  selectedLessonId: string | undefined
  onReturnToEvidence?: (
    target: Readonly<{ documentId: string; pageNumber: number; blockId?: string }>,
  ) => void
}): React.JSX.Element => {
  const [listState, setListState] = useState<LessonListState>({ status: 'loading' })
  const [detailState, setDetailState] = useState<LessonDetailState>({ status: 'idle' })
  const [replyText, setReplyText] = useState('')
  const [replyState, setReplyState] = useState<ReplyState>({ status: 'idle' })
  const [runRetryState, setRunRetryState] = useState<RunRetryState>({ status: 'idle' })
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false)
  const [reviewResponses, setReviewResponses] = useState<Record<string, string>>({})
  const [reviewSavingId, setReviewSavingId] = useState<string | null>(null)
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const listRequestSequence = useRef(0)
  const detailRequestSequence = useRef(0)
  const replyRequestSequence = useRef(0)
  const retryRequestSequence = useRef(0)
  const reviewRequestSequence = useRef(0)

  const updateSession = useCallback((session: LessonSessionDto) => {
    setDetailState({ status: 'ready', session })
    setListState((current) =>
      current.status === 'ready'
        ? { status: 'ready', sessions: replaceSession(current.sessions, session) }
        : current,
    )
  }, [])

  const openLesson = useCallback(async (lessonId: string) => {
    const requestSequence = detailRequestSequence.current + 1
    detailRequestSequence.current = requestSequence
    replyRequestSequence.current += 1
    retryRequestSequence.current += 1
    reviewRequestSequence.current += 1
    setInfoDrawerOpen(false)
    setReviewSavingId(null)
    setDetailState({ status: 'loading', lessonId })
    const result = await window.deepstorming.lessons.get(lessonId)
    if (detailRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setDetailState({ status: 'ready', session: result.data })
      setReplyText('')
      setReplyState({ status: 'idle' })
      setRunRetryState({ status: 'idle' })
      setReviewFeedback(null)
      setReviewError(null)
      return
    }

    setDetailState({ status: 'error', lessonId, message: result.error.message })
  }, [])

  const loadLessons = useCallback(async () => {
    const requestSequence = listRequestSequence.current + 1
    listRequestSequence.current = requestSequence
    setListState({ status: 'loading' })
    const result = await window.deepstorming.lessons.list()
    if (listRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setListState({ status: 'ready', sessions: result.data })
      const lessonToOpen = selectedLessonId ?? result.data[0]?.id
      if (lessonToOpen !== undefined) void openLesson(lessonToOpen)
      return
    }

    setListState({ status: 'error', message: result.error.message })
  }, [openLesson, selectedLessonId])

  const submitReply = useCallback(async () => {
    if (detailState.status !== 'ready') return
    const content = replyText.trim()
    if (content.length === 0) {
      setReplyState({ status: 'error', message: '请输入回答。' })
      return
    }

    const requestSequence = replyRequestSequence.current + 1
    replyRequestSequence.current = requestSequence
    const operationId = globalThis.crypto.randomUUID()
    setReplyState({ status: 'submitting', operationId })
    const result = await window.deepstorming.lessons.reply({
      lessonId: detailState.session.id,
      content,
      operationId,
    })
    if (replyRequestSequence.current !== requestSequence) return

    if (result.ok) {
      updateSession(result.data)
      setReplyText('')
      setReplyState({ status: 'success', message: '回答已提交。' })
      return
    }
    if (result.error.code === 'OPERATION_CANCELLED') {
      setReplyState({ status: 'success', message: '生成已取消。' })
      return
    }
    setReplyState({ status: 'error', message: result.error.message })
  }, [detailState, replyText, updateSession])

  const cancelReply = useCallback(async () => {
    if (replyState.status !== 'submitting') return
    replyRequestSequence.current += 1
    const result = await window.deepstorming.lessons.cancelRun(replyState.operationId)
    setReplyState({
      status: result.ok && result.data.cancelled ? 'success' : 'error',
      message: result.ok
        ? result.data.cancelled
          ? '生成已取消。'
          : '取消请求未生效。'
        : result.error.message,
    })
  }, [replyState])

  const retryRun = useCallback(
    async (modelRunId: string) => {
      if (detailState.status !== 'ready') return
      const requestSequence = retryRequestSequence.current + 1
      retryRequestSequence.current = requestSequence
      const operationId = globalThis.crypto.randomUUID()
      setRunRetryState({ status: 'retrying', modelRunId, operationId })
      const result = await window.deepstorming.lessons.retryRun({
        lessonId: detailState.session.id,
        modelRunId,
        operationId,
      })
      if (retryRequestSequence.current !== requestSequence) return

      if (result.ok) {
        updateSession(result.data)
        setRunRetryState({ status: 'success', message: '已重新生成。' })
        return
      }
      if (result.error.code === 'OPERATION_CANCELLED') {
        setRunRetryState({ status: 'success', message: '生成已取消。' })
        return
      }
      setRunRetryState({ status: 'error', message: result.error.message })
    },
    [detailState, updateSession],
  )

  const cancelRetry = useCallback(async () => {
    if (runRetryState.status !== 'retrying') return
    retryRequestSequence.current += 1
    const result = await window.deepstorming.lessons.cancelRun(runRetryState.operationId)
    setRunRetryState({
      status: result.ok && result.data.cancelled ? 'success' : 'error',
      message: result.ok
        ? result.data.cancelled
          ? '生成已取消。'
          : '取消请求未生效。'
        : result.error.message,
    })
  }, [runRetryState])

  const recordReview = useCallback(
    async (reviewItemId: string, rating: 'remembered' | 'forgot') => {
      if (detailState.status !== 'ready') return
      const requestSequence = reviewRequestSequence.current + 1
      reviewRequestSequence.current = requestSequence
      const response = (reviewResponses[reviewItemId] ?? '').trim()
      if (response.length === 0) {
        setReviewError('请输入复习回答。')
        return
      }
      setReviewSavingId(reviewItemId)
      setReviewFeedback(null)
      setReviewError(null)
      const result = await window.deepstorming.lessons.recordReview({
        lessonId: detailState.session.id,
        reviewItemId,
        rating,
        response,
      })
      if (reviewRequestSequence.current !== requestSequence) return
      if (result.ok) {
        updateSession(result.data)
        setReviewResponses((current) => ({ ...current, [reviewItemId]: '' }))
        setReviewFeedback('复习记录已保存。')
      } else {
        setReviewError(result.error.message)
      }
      setReviewSavingId(null)
    },
    [detailState, reviewResponses, updateSession],
  )

  useEffect(() => {
    void loadLessons()
    return () => {
      listRequestSequence.current += 1
      detailRequestSequence.current += 1
      replyRequestSequence.current += 1
      retryRequestSequence.current += 1
      reviewRequestSequence.current += 1
    }
  }, [loadLessons])

  const composerState =
    replyState.status === 'submitting'
      ? ({ status: 'submitting' } as const)
      : replyState.status === 'success' || replyState.status === 'error'
        ? replyState
        : ({ status: 'idle' } as const)

  return (
    <>
      <WorkspaceContextual>
        <section className="lesson-contextual-navigation" aria-label="课堂与课程记录内容">
          <div className="contextual-section-header">
            <h2>课堂记录</h2>
            <p>按来源文档分组</p>
          </div>
          {listState.status === 'loading' && <p className="muted-state">正在加载课堂…</p>}
          {listState.status === 'error' && (
            <div>
              <p role="alert" className="error-state">
                {listState.message}
              </p>
              <button type="button" onClick={() => void loadLessons()}>
                重试加载
              </button>
            </div>
          )}
          {listState.status === 'ready' && (
            <LessonSessionTree
              sessions={listState.sessions}
              selectedLessonId={detailState.status === 'ready' ? detailState.session.id : undefined}
              onSelect={(lessonId) => void openLesson(lessonId)}
            />
          )}
        </section>
      </WorkspaceContextual>

      {detailState.status !== 'ready' && (
        <section className="lesson-chat-empty" aria-live="polite">
          <h1>课堂</h1>
          {detailState.status === 'loading' && <p>正在加载课堂详情…</p>}
          {detailState.status === 'idle' && <p>选择一节课堂开始学习。</p>}
          {detailState.status === 'error' && (
            <>
              <p role="alert" className="error-state">
                {detailState.message}
              </p>
              <button type="button" onClick={() => void openLesson(detailState.lessonId)}>
                重试课堂详情
              </button>
            </>
          )}
        </section>
      )}

      {detailState.status === 'ready' && (
        <section className="lesson-chat" aria-label="课堂对话">
          <header className="lesson-chat-header">
            <div>
              <p>{detailState.session.documentTitle}</p>
              <h1>{detailState.session.title}</h1>
              <span>当前阶段：{lessonStateLabels[detailState.session.currentState]}</span>
            </div>
            <button type="button" onClick={() => setInfoDrawerOpen(true)}>
              课堂信息
            </button>
          </header>

          <LessonConversation
            session={detailState.session}
            retryingModelRunId={
              runRetryState.status === 'retrying' ? runRetryState.modelRunId : undefined
            }
            onRetryRun={(modelRunId) => void retryRun(modelRunId)}
            onCancelRetry={() => void cancelRetry()}
            {...(onReturnToEvidence === undefined ? {} : { onReturnToEvidence })}
          />

          <LessonComposer
            value={replyText}
            state={composerState}
            onChange={setReplyText}
            onSubmit={() => void submitReply()}
            onCancel={() => void cancelReply()}
          />

          {runRetryState.status === 'success' && (
            <p role="status" className="lesson-chat-operation success-state">
              {runRetryState.message}
            </p>
          )}
          {runRetryState.status === 'error' && (
            <p role="alert" className="lesson-chat-operation error-state">
              {runRetryState.message}
            </p>
          )}

          <LessonInfoDrawer
            open={infoDrawerOpen}
            session={detailState.session}
            reviewResponses={reviewResponses}
            reviewSavingId={reviewSavingId}
            reviewFeedback={reviewFeedback}
            reviewError={reviewError}
            onClose={() => setInfoDrawerOpen(false)}
            onReturnToEvidence={(target) => onReturnToEvidence?.(target)}
            onReviewResponseChange={(reviewItemId, value) =>
              setReviewResponses((current) => ({ ...current, [reviewItemId]: value }))
            }
            onRecordReview={(reviewItemId, rating) => void recordReview(reviewItemId, rating)}
          />
        </section>
      )}
    </>
  )
}
