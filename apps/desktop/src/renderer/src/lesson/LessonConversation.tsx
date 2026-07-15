import type { LessonSessionDto, UserProfileDto } from '@deepstorming/contracts'
import React, { useLayoutEffect, useRef, useState } from 'react'

import { RichMessage } from './RichMessage'
import { MessageAvatar } from './MessageAvatar'

type LessonConversationProps = Readonly<{
  session: LessonSessionDto
  learnerProfile?: UserProfileDto | undefined
  retryingModelRunId?: string | undefined
  onRetryRun: (modelRunId: string) => void
  onCancelRetry: () => void
  onReturnToEvidence?: (
    target: Readonly<{ documentId: string; pageNumber: number; blockId?: string }>,
  ) => void
}>

const roleLabels = {
  tutor: '导师',
  learner: '学习者',
  system: '系统',
} as const

const BOTTOM_THRESHOLD = 96

export const LessonConversation = ({
  session,
  learnerProfile,
  retryingModelRunId,
  onRetryRun,
  onCancelRetry,
  onReturnToEvidence,
}: LessonConversationProps): React.JSX.Element => {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const previousMessageCount = useRef<number | undefined>(undefined)
  const nearBottom = useRef(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const latestRun = session.modelRuns.at(-1)
  const recoveryRun =
    latestRun?.status === 'failed' || latestRun?.status === 'cancelled' ? latestRun : undefined

  const scrollToBottom = () => {
    const scroller = scrollerRef.current
    if (scroller === null) return
    scroller.scrollTop = scroller.scrollHeight
    nearBottom.current = true
    setHasNewMessages(false)
  }

  useLayoutEffect(() => {
    const previous = previousMessageCount.current
    previousMessageCount.current = session.messages.length
    if (previous === undefined || session.messages.length <= previous) return
    if (nearBottom.current) scrollToBottom()
    else setHasNewMessages(true)
  }, [session.messages.length])

  return (
    <div className="lesson-conversation-wrap">
      <div
        ref={scrollerRef}
        className="lesson-conversation"
        role="log"
        aria-label="课堂消息"
        aria-live="polite"
        onScroll={(event) => {
          const target = event.currentTarget
          nearBottom.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= BOTTOM_THRESHOLD
          if (nearBottom.current) setHasNewMessages(false)
        }}
      >
        {session.messages.length === 0 && (
          <p className="muted-state">这节课还没有对话，导师正在准备第一个问题。</p>
        )}
        {session.messages.map((message) => {
          const label = roleLabels[message.role]
          const pdfAnchor = session.sourceAnchors.find(
            (anchor) =>
              message.sourceAnchorIds.includes(anchor.id) && anchor.target?.kind === 'pdf_block',
          )
          const pdfTarget = pdfAnchor?.target?.kind === 'pdf_block' ? pdfAnchor.target : undefined
          const participantName =
            message.role === 'tutor'
              ? (session.tutorSnapshot?.name ?? '导师')
              : message.role === 'learner'
                ? (learnerProfile?.displayName ?? '学习者')
                : '系统'
          const participantAvatar =
            message.role === 'tutor'
              ? session.tutorSnapshot?.avatarAssetId
              : message.role === 'learner'
                ? learnerProfile?.avatarAssetId
                : undefined
          return (
            <div
              key={message.id}
              className={`lesson-message-row lesson-message-row-${message.role}`}
            >
              <MessageAvatar name={participantName} assetId={participantAvatar} />
              <article
                className={`lesson-message-bubble lesson-message-${message.role}`}
                aria-label={`${label}消息`}
              >
                <RichMessage
                  role={message.role}
                  markdown={message.tutorTurn?.responseMarkdown ?? message.content}
                  narration={message.role === 'tutor' ? message.tutorTurn?.narration : null}
                  citations={message.role === 'tutor' ? message.tutorTurn?.citations : []}
                  documentId={session.documentId}
                  figureReferences={
                    message.role === 'tutor' ? message.tutorTurn?.figureReferences : []
                  }
                  onReturnToCitation={
                    pdfAnchor && pdfTarget && onReturnToEvidence
                      ? () =>
                          onReturnToEvidence({
                            documentId: pdfAnchor.documentId,
                            pageNumber: pdfTarget.pageNumber,
                            blockId: pdfTarget.blockId,
                          })
                      : undefined
                  }
                  onReturnToFigure={
                    onReturnToEvidence
                      ? (figure) =>
                          onReturnToEvidence({
                            documentId: figure.documentId,
                            pageNumber: figure.pageNumber,
                          })
                      : undefined
                  }
                />
                <footer>{label}</footer>
              </article>
            </div>
          )
        })}
        {recoveryRun && (
          <article className="lesson-run-recovery" aria-label="生成失败">
            <p>{recoveryRun.errorSummary?.message ?? '本次生成未完成。'}</p>
            <small>
              {recoveryRun.promptManifest.key} v{recoveryRun.promptManifest.version}
            </small>
            {retryingModelRunId === recoveryRun.id ? (
              <button type="button" className="secondary-button" onClick={onCancelRetry}>
                取消重试
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRetryRun(recoveryRun.id)}
              >
                重试生成 {recoveryRun.promptManifest.key} v{recoveryRun.promptManifest.version}
              </button>
            )}
          </article>
        )}
      </div>
      {hasNewMessages && (
        <button type="button" className="lesson-new-message" onClick={scrollToBottom}>
          有新消息
        </button>
      )}
    </div>
  )
}
