import type {
  LessonMasteryEvidenceDto,
  LessonSessionDto,
  LessonStateDto,
} from '@deepstorming/contracts'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { WorkspaceContextual } from '../app/WorkspaceShell'
import { LessonSessionTree } from './LessonSessionTree'

type LessonListState =
  | { status: 'loading' }
  | { status: 'ready'; sessions: LessonSessionDto[] }
  | { status: 'error'; message: string }

type LessonDetailState =
  | { status: 'idle' }
  | { status: 'loading'; lessonId: string }
  | { status: 'ready'; session: LessonSessionDto }
  | { status: 'error'; message: string }

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

const formatContextChunkLabel = (chunk: {
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}): string =>
  chunk.pageNumberStart === chunk.pageNumberEnd
    ? `第 ${chunk.pageNumberStart} 页 · ${chunk.charCount} 字`
    : `第 ${chunk.pageNumberStart}-${chunk.pageNumberEnd} 页 · ${chunk.charCount} 字`

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

const paperStageLabels: Record<
  NonNullable<LessonSessionDto['paperProfile']>['currentStage'],
  string
> = {
  orientation: '整体定位',
  problem_framing: '问题定位',
  method_intuition: '方法直觉',
  method_mechanics: '方法细节',
  evidence_check: '证据核验',
  critical_review: '批判审视',
  transfer: '迁移延伸',
  synthesis: '复盘整合',
}

const masteryJudgementLabels: Record<LessonMasteryEvidenceDto['judgement'], string> = {
  insufficient: '证据不足',
  partial_understanding: '部分理解',
  needs_review: '建议复习',
}

const stepForRun = (session: LessonSessionDto, modelRunId: string) =>
  session.steps.find((step) => step.modelRunId === modelRunId)

const latestMasteryEvidence = (session: LessonSessionDto): LessonMasteryEvidenceDto | undefined =>
  [...session.masteryEvidence].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0]

export const LessonWorkspace = ({
  selectedLessonId,
  onReturnToEvidence,
}: {
  selectedLessonId: string | undefined
  onReturnToEvidence?: (
    target: Readonly<{ documentId: string; pageNumber: number; blockId: string }>,
  ) => void
}): React.JSX.Element => {
  const [listState, setListState] = useState<LessonListState>({ status: 'loading' })
  const [detailState, setDetailState] = useState<LessonDetailState>({ status: 'idle' })
  const [replyText, setReplyText] = useState('')
  const [replyState, setReplyState] = useState<ReplyState>({ status: 'idle' })
  const [runRetryState, setRunRetryState] = useState<RunRetryState>({ status: 'idle' })
  const [reviewResponses, setReviewResponses] = useState<Record<string, string>>({})
  const [reviewSavingId, setReviewSavingId] = useState<string | null>(null)
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const listRequestSequence = useRef(0)
  const detailRequestSequence = useRef(0)

  const openLesson = useCallback(async (lessonId: string) => {
    const requestSequence = detailRequestSequence.current + 1
    detailRequestSequence.current = requestSequence
    setDetailState({ status: 'loading', lessonId })
    const result = await window.deepstorming.lessons.get(lessonId)
    if (detailRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setDetailState({ status: 'ready', session: result.data })
      setReplyState({ status: 'idle' })
      setRunRetryState({ status: 'idle' })
      setReviewFeedback(null)
      setReviewError(null)
      return
    }

    setDetailState({ status: 'error', message: result.error.message })
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

  const submitReply = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (detailState.status !== 'ready') return
      const content = replyText.trim()
      if (content.length === 0) {
        setReplyState({ status: 'error', message: '请输入回答。' })
        return
      }

      const operationId = globalThis.crypto.randomUUID()
      setReplyState({ status: 'submitting', operationId })
      const result = await window.deepstorming.lessons.reply({
        lessonId: detailState.session.id,
        content,
        operationId,
      })

      if (result.ok) {
        setDetailState({ status: 'ready', session: result.data })
        setListState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                sessions: current.sessions.map((session) =>
                  session.id === result.data.id ? result.data : session,
                ),
              }
            : current,
        )
        setReplyText('')
        setReplyState({ status: 'success', message: '回答已提交。' })
        return
      }

      if (result.error.code === 'OPERATION_CANCELLED') {
        setReplyState({ status: 'success', message: '生成已取消。' })
        return
      }
      setReplyState({ status: 'error', message: result.error.message })
    },
    [detailState, replyText],
  )

  const cancelReply = useCallback(async () => {
    if (replyState.status !== 'submitting') return
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

      const operationId = globalThis.crypto.randomUUID()
      setRunRetryState({ status: 'retrying', modelRunId, operationId })
      const result = await window.deepstorming.lessons.retryRun({
        lessonId: detailState.session.id,
        modelRunId,
        operationId,
      })

      if (result.ok) {
        setDetailState({ status: 'ready', session: result.data })
        setListState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                sessions: current.sessions.map((session) =>
                  session.id === result.data.id ? result.data : session,
                ),
              }
            : current,
        )
        setRunRetryState({ status: 'success', message: '已重新生成。' })
        return
      }

      if (result.error.code === 'OPERATION_CANCELLED') {
        setRunRetryState({ status: 'success', message: '生成已取消。' })
        return
      }
      setRunRetryState({ status: 'error', message: result.error.message })
    },
    [detailState],
  )

  const cancelRetry = useCallback(async () => {
    if (runRetryState.status !== 'retrying') return
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

      if (result.ok) {
        setDetailState({ status: 'ready', session: result.data })
        setListState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                sessions: current.sessions.map((session) =>
                  session.id === result.data.id ? result.data : session,
                ),
              }
            : current,
        )
        setReviewResponses((current) => ({ ...current, [reviewItemId]: '' }))
        setReviewFeedback('复习记录已保存。')
        setReviewSavingId(null)
        return
      }

      setReviewError(result.error.message)
      setReviewSavingId(null)
    },
    [detailState, reviewResponses],
  )

  useEffect(() => {
    void loadLessons()
  }, [loadLessons])

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

      <div className="provider-workspace">
        <section className="workspace-header" aria-labelledby="lesson-title">
          <div>
            <p className="section-kicker">LESSONS</p>
            <h1 id="lesson-title">课堂</h1>
            <p>从文档证据启动本地课堂会话，后续会接入 AI 导师状态机。</p>
          </div>
        </section>

        <section className="panel document-detail" aria-live="polite">
          <div className="panel-header">
            <h2>课堂详情</h2>
          </div>

          {detailState.status !== 'ready' && (
            <p className="muted-state">
              {detailState.status === 'loading' ? '正在加载课堂详情…' : '选择课堂后查看来源证据。'}
            </p>
          )}
          {detailState.status === 'error' && (
            <p role="alert" className="error-state">
              {detailState.message}
            </p>
          )}
          {detailState.status === 'ready' && (
            <article>
              <h2>{detailState.session.title}</h2>
              <p className="field-help">{detailState.session.documentTitle}</p>
              <p className="lesson-state-pill">
                当前阶段：{lessonStateLabels[detailState.session.currentState]}
              </p>
              {detailState.session.lessonMode === 'paper' &&
              detailState.session.paperProfile !== null ? (
                <section className="lesson-paper-stage">
                  <h3>当前论文阶段</h3>
                  <p>{paperStageLabels[detailState.session.paperProfile.currentStage]}</p>
                  {detailState.session.paperProfile.stageSummary !== null ? (
                    <p>{detailState.session.paperProfile.stageSummary}</p>
                  ) : null}
                </section>
              ) : null}
              <div className="lesson-anchor-list">
                {detailState.session.sourceAnchors.map((anchor) => (
                  <blockquote key={anchor.id} className="lesson-anchor">
                    <p>{anchor.snippet}</p>
                    <footer>
                      {anchor.target?.kind === 'pdf_block'
                        ? `第 ${anchor.target.pageNumber} 页 · Block ${anchor.target.blockIndex + 1}`
                        : `字符 ${anchor.startOffset}–${anchor.endOffset}`}
                    </footer>
                    {anchor.target?.kind === 'pdf_block' &&
                      (() => {
                        const target = anchor.target
                        return (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              onReturnToEvidence?.({
                                documentId: anchor.documentId,
                                pageNumber: target.pageNumber,
                                blockId: target.blockId,
                              })
                            }
                          >
                            回到证据
                          </button>
                        )
                      })()}
                  </blockquote>
                ))}
              </div>
              <div className="lesson-message-list">
                <h3>导师提问</h3>
                {detailState.session.messages.map((message) => (
                  <article key={message.id} className="lesson-message">
                    <p>{message.content}</p>
                    <footer>
                      {message.role === 'tutor'
                        ? '导师'
                        : message.role === 'learner'
                          ? '学习者'
                          : '系统'}{' '}
                      · Prompt {message.promptVersion}
                    </footer>
                  </article>
                ))}
                {detailState.session.messages.length === 0 && (
                  <p className="muted-state">这节课还没有消息。</p>
                )}
              </div>
              <div className="lesson-run-list">
                <h3>生成记录</h3>
                {detailState.session.modelRuns.map((modelRun) => {
                  const lessonStep = stepForRun(detailState.session, modelRun.id)
                  return (
                    <article key={modelRun.id} className="lesson-run">
                      <p>
                        {modelRun.modelName} · {modelRun.status}
                      </p>
                      {lessonStep === undefined ? (
                        <p className="lesson-step-meta">状态机记录尚未生成</p>
                      ) : (
                        <p className="lesson-step-meta">
                          动作：{lessonStep.actionType} · {lessonStep.stateBefore} →{' '}
                          {lessonStep.stateAfter}
                        </p>
                      )}
                      <footer>
                        {modelRun.promptManifest.key} v{modelRun.promptManifest.version}
                      </footer>
                      <div className="lesson-context-chunks">
                        <h4>上下文证据</h4>
                        {modelRun.inputSummary.contextChunks.length > 0 ? (
                          <ul>
                            {modelRun.inputSummary.contextChunks.map((chunk) => (
                              <li key={chunk.chunkId}>{formatContextChunkLabel(chunk)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="lesson-context-fallback">
                            课堂仍可继续（已降级为 snippet）
                          </p>
                        )}
                      </div>
                      {modelRun.errorSummary !== null && (
                        <p className="error-state">{modelRun.errorSummary.message}</p>
                      )}
                      {(modelRun.status === 'failed' || modelRun.status === 'cancelled') && (
                        <div className="card-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={
                              runRetryState.status === 'retrying' &&
                              runRetryState.modelRunId === modelRun.id
                            }
                            onClick={() => void retryRun(modelRun.id)}
                          >
                            {runRetryState.status === 'retrying' &&
                            runRetryState.modelRunId === modelRun.id
                              ? '重试中…'
                              : `重试生成 ${modelRun.promptManifest.key} v${modelRun.promptManifest.version}`}
                          </button>
                          {runRetryState.status === 'retrying' &&
                            runRetryState.modelRunId === modelRun.id && (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => void cancelRetry()}
                              >
                                取消重试
                              </button>
                            )}
                        </div>
                      )}
                    </article>
                  )
                })}
                {detailState.session.modelRuns.length === 0 && (
                  <p className="muted-state">这节课还没有生成记录。</p>
                )}
                {runRetryState.status === 'success' && (
                  <p className="success-state">{runRetryState.message}</p>
                )}
                {runRetryState.status === 'error' && (
                  <p role="alert" className="error-state">
                    {runRetryState.message}
                  </p>
                )}
              </div>
              {(() => {
                const evidence = latestMasteryEvidence(detailState.session)
                const matchingSignals =
                  evidence === undefined
                    ? []
                    : detailState.session.misconceptionSignals.filter(
                        (signal) => signal.evidenceId === evidence.id,
                      )

                return (
                  <section
                    className="lesson-mastery-diagnosis"
                    aria-labelledby="lesson-mastery-title"
                  >
                    <h3 id="lesson-mastery-title">学习诊断</h3>
                    {evidence === undefined ? (
                      <p className="muted-state">还没有学习诊断。</p>
                    ) : (
                      <article className="lesson-mastery-card">
                        <p className="lesson-mastery-summary">
                          {masteryJudgementLabels[evidence.judgement]} ·{' '}
                          {Math.round(evidence.confidence * 100)}%
                        </p>
                        <p>{evidence.rationale}</p>
                        {evidence.suggestedReview && (
                          <p className="lesson-review-suggestion">建议加入后续复习</p>
                        )}
                        {matchingSignals.length > 0 && (
                          <ul className="lesson-misconception-list">
                            {matchingSignals.map((signal) => (
                              <li key={signal.id}>
                                <span>
                                  可能误区：{signal.label} · {signal.severity}
                                </span>
                                <p className="lesson-misconception-rationale">{signal.rationale}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    )}
                  </section>
                )
              })()}
              {(() => {
                const activeReviewItems = [...detailState.session.reviewItems]
                  .filter((item) => item.status === 'active')
                  .sort((left, right) => left.dueAt.localeCompare(right.dueAt))

                return (
                  <section
                    className="lesson-mastery-diagnosis"
                    aria-labelledby="lesson-review-title"
                  >
                    <h3 id="lesson-review-title">复习任务</h3>
                    {activeReviewItems.length === 0 ? (
                      <p className="muted-state">还没有复习任务。</p>
                    ) : (
                      activeReviewItems.map((item) => (
                        <article key={item.id} className="lesson-mastery-card">
                          <p className="lesson-mastery-summary">{item.prompt}</p>
                          <p>下次复习：{item.dueAt.slice(0, 10)}</p>
                          <ul className="lesson-misconception-list">
                            {item.answerOutline.map((point) => (
                              <li key={point}>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                          <label htmlFor={`review-response-${item.id}`}>这次复习回答</label>
                          <textarea
                            id={`review-response-${item.id}`}
                            value={reviewResponses[item.id] ?? ''}
                            onChange={(event) =>
                              setReviewResponses((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            rows={3}
                            maxLength={1000}
                            disabled={reviewSavingId === item.id}
                          />
                          <div className="card-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={reviewSavingId === item.id}
                              onClick={() => void recordReview(item.id, 'remembered')}
                            >
                              {reviewSavingId === item.id ? '保存中…' : '记住了'}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={reviewSavingId === item.id}
                              onClick={() => void recordReview(item.id, 'forgot')}
                            >
                              还不稳
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                    {reviewFeedback !== null && <p className="success-state">{reviewFeedback}</p>}
                    {reviewError !== null && (
                      <p role="alert" className="error-state">
                        {reviewError}
                      </p>
                    )}
                  </section>
                )
              })()}
              <form className="lesson-reply-form" onSubmit={(event) => void submitReply(event)}>
                <label htmlFor="lesson-reply">你的回答</label>
                <textarea
                  id="lesson-reply"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  disabled={replyState.status === 'submitting'}
                />
                <div className="card-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={replyState.status === 'submitting'}
                  >
                    {replyState.status === 'submitting' ? '提交中…' : '提交回答'}
                  </button>
                  {replyState.status === 'submitting' && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void cancelReply()}
                    >
                      取消生成
                    </button>
                  )}
                </div>
                {replyState.status === 'success' && (
                  <p className="success-state">{replyState.message}</p>
                )}
                {replyState.status === 'error' && (
                  <p role="alert" className="error-state">
                    {replyState.message}
                  </p>
                )}
              </form>
            </article>
          )}
        </section>
      </div>
    </>
  )
}
