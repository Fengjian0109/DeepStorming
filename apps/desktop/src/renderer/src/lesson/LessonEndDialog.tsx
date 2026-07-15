import type { LessonSessionDto } from '@deepstorming/contracts'
import React from 'react'

import { RichMessage } from './RichMessage'

type LessonEndDialogProps = Readonly<{
  session: LessonSessionDto
  confirmationOpen: boolean
  ending: boolean
  savingChoice: boolean
  completingReview: boolean
  error?: string | undefined
  reviewResponse: string
  onOpenConfirmation: () => void
  onCloseConfirmation: () => void
  onConfirmEnd: () => void
  onCancelEnd: () => void
  onChooseAction: (action: 'immediate_review' | 'rest') => void
  onReviewResponseChange: (value: string) => void
  onCompleteReview: () => void
}>

export const LessonEndDialog = ({
  session,
  confirmationOpen,
  ending,
  savingChoice,
  completingReview,
  error,
  reviewResponse,
  onOpenConfirmation,
  onCloseConfirmation,
  onConfirmEnd,
  onCancelEnd,
  onChooseAction,
  onReviewResponseChange,
  onCompleteReview,
}: LessonEndDialogProps): React.JSX.Element => (
  <>
    {(session.status === 'active' || session.status === 'error') && !ending && (
      <button type="button" className="lesson-end-trigger" onClick={onOpenConfirmation}>
        {session.status === 'error' ? '重试下课总结' : '下课并保存记忆'}
      </button>
    )}

    {confirmationOpen && (
      <div className="lesson-end-overlay" role="presentation">
        <section
          className="lesson-end-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-end-title"
        >
          <h2 id="lesson-end-title">结束本节课？</h2>
          <p>AI 将根据本节完整对话整理课程记忆。总结完成后，你可以立即复习或先休息。</p>
          <div className="lesson-end-actions">
            <button type="button" className="secondary-button" onClick={onCloseConfirmation}>
              继续上课
            </button>
            <button type="button" onClick={onConfirmEnd}>
              确认下课
            </button>
          </div>
        </section>
      </div>
    )}

    {ending && (
      <section className="lesson-end-panel" aria-live="polite">
        <div>
          <strong>正在整理课程记忆…</strong>
          <p>这一步完全由当前 AI Provider 完成。</p>
        </div>
        <button type="button" className="secondary-button" onClick={onCancelEnd}>
          取消课程总结
        </button>
      </section>
    )}

    {(session.status === 'pending_review' ||
      session.status === 'reviewing' ||
      session.status === 'completed') &&
      session.memory && (
        <section className="lesson-end-panel lesson-memory-panel" aria-label="课程记忆与复习">
          <div className="lesson-memory-heading">
            <div>
              <span>课程记忆</span>
              <h2>{session.memory.topic}</h2>
              <p>{session.memory.coverage}</p>
            </div>
            {session.status === 'completed' && <strong>本节课已完成</strong>}
          </div>
          <RichMessage role="system" markdown={session.memory.summaryMarkdown} />
          {session.status === 'pending_review' && (
            <div className="lesson-end-actions">
              <button
                type="button"
                disabled={savingChoice}
                onClick={() => onChooseAction('immediate_review')}
              >
                立即复习
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={savingChoice}
                onClick={() => onChooseAction('rest')}
              >
                先休息
              </button>
            </div>
          )}
          {session.status === 'reviewing' && (
            <div className="lesson-review-gate">
              <h3>课后复习</h3>
              <ul>
                {session.memory.reviewPrompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
              <label htmlFor="lesson-post-review">课后复习回答</label>
              <textarea
                id="lesson-post-review"
                rows={4}
                maxLength={8000}
                value={reviewResponse}
                onChange={(event) => onReviewResponseChange(event.target.value)}
              />
              <div className="lesson-end-actions">
                <button type="button" disabled={completingReview} onClick={onCompleteReview}>
                  {completingReview ? '正在保存…' : '完成复习并结束本节课'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={savingChoice}
                  onClick={() => onChooseAction('rest')}
                >
                  稍后复习
                </button>
              </div>
            </div>
          )}
          {session.status === 'completed' && session.reviewResponse && (
            <p className="lesson-review-saved">复习回答：{session.reviewResponse}</p>
          )}
        </section>
      )}

    {error && (
      <p role="alert" className="lesson-lifecycle-error error-state">
        {error}
      </p>
    )}
  </>
)
