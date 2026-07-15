import type {
  LessonMasteryEvidenceDto,
  LessonSessionDto,
  LessonStateDto,
} from '@deepstorming/contracts'
import React, { useEffect, useRef, useState } from 'react'

type LessonInfoDrawerProps = Readonly<{
  open: boolean
  session: LessonSessionDto
  reviewResponses: Readonly<Record<string, string>>
  reviewSavingId: string | null
  reviewFeedback: string | null
  reviewError: string | null
  onClose: () => void
  onReturnToEvidence: (target: { documentId: string; pageNumber: number; blockId: string }) => void
  onReviewResponseChange: (reviewItemId: string, value: string) => void
  onRecordReview: (reviewItemId: string, rating: 'remembered' | 'forgot') => void
}>

type DrawerTab = 'evidence' | 'progress' | 'diagnosis' | 'review' | 'technical'

const tabs: ReadonlyArray<Readonly<{ id: DrawerTab; label: string }>> = [
  { id: 'evidence', label: '证据' },
  { id: 'progress', label: '进度' },
  { id: 'diagnosis', label: '诊断' },
  { id: 'review', label: '复习' },
  { id: 'technical', label: '技术' },
]

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

const formatContextChunkLabel = (chunk: {
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}): string =>
  chunk.pageNumberStart === chunk.pageNumberEnd
    ? `第 ${chunk.pageNumberStart} 页 · ${chunk.charCount} 字`
    : `第 ${chunk.pageNumberStart}-${chunk.pageNumberEnd} 页 · ${chunk.charCount} 字`

export const LessonInfoDrawer = ({
  open,
  session,
  reviewResponses,
  reviewSavingId,
  reviewFeedback,
  reviewError,
  onClose,
  onReturnToEvidence,
  onReviewResponseChange,
  onRecordReview,
}: LessonInfoDrawerProps): React.JSX.Element | null => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('evidence')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null
    headingRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    globalThis.window.addEventListener('keydown', handleKeyDown)
    return () => {
      globalThis.window.removeEventListener('keydown', handleKeyDown)
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const latestEvidence = [...session.masteryEvidence].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0]
  const activeReviewItems = session.reviewItems
    .filter((item) => item.status === 'active')
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))

  return (
    <aside
      className="lesson-info-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="lesson-info-title"
    >
      <header className="lesson-info-header">
        <h2 id="lesson-info-title" ref={headingRef} tabIndex={-1}>
          课堂信息
        </h2>
        <button type="button" className="secondary-button" onClick={onClose}>
          关闭课堂信息
        </button>
      </header>
      <div className="lesson-info-tabs" role="tablist" aria-label="课堂信息分类">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            key={tab.id}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="lesson-info-content" role="tabpanel">
        {activeTab === 'evidence' && (
          <section aria-label="来源证据">
            {session.sourceAnchors.length === 0 && <p className="muted-state">没有来源证据。</p>}
            {session.sourceAnchors.map((anchor) => {
              const pdfTarget = anchor.target?.kind === 'pdf_block' ? anchor.target : undefined
              return (
                <blockquote key={anchor.id} className="lesson-anchor">
                  <p>{anchor.snippet}</p>
                  <footer>
                    {pdfTarget
                      ? `第 ${pdfTarget.pageNumber} 页 · Block ${pdfTarget.blockIndex + 1}`
                      : `字符 ${anchor.startOffset}–${anchor.endOffset}`}
                  </footer>
                  {pdfTarget && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        onReturnToEvidence({
                          documentId: anchor.documentId,
                          pageNumber: pdfTarget.pageNumber,
                          blockId: pdfTarget.blockId,
                        })
                      }
                    >
                      回到证据
                    </button>
                  )}
                </blockquote>
              )
            })}
          </section>
        )}

        {activeTab === 'progress' && (
          <section className="lesson-info-section" aria-label="课堂进度">
            <p>当前阶段：{lessonStateLabels[session.currentState]}</p>
            {session.paperProfile && (
              <>
                <p>论文阶段：{paperStageLabels[session.paperProfile.currentStage]}</p>
                {session.paperProfile.stageSummary && <p>{session.paperProfile.stageSummary}</p>}
              </>
            )}
          </section>
        )}

        {activeTab === 'diagnosis' && (
          <section className="lesson-info-section" aria-label="学习诊断">
            {latestEvidence === undefined ? (
              <p className="muted-state">还没有学习诊断。</p>
            ) : (
              <>
                <p className="lesson-mastery-summary">
                  {masteryJudgementLabels[latestEvidence.judgement]} ·{' '}
                  {Math.round(latestEvidence.confidence * 100)}%
                </p>
                <p>{latestEvidence.rationale}</p>
                {session.misconceptionSignals
                  .filter((signal) => signal.evidenceId === latestEvidence.id)
                  .map((signal) => (
                    <article key={signal.id} className="lesson-diagnosis-signal">
                      <strong>{signal.label}</strong>
                      <p>{signal.rationale}</p>
                    </article>
                  ))}
              </>
            )}
          </section>
        )}

        {activeTab === 'review' && (
          <section className="lesson-info-section" aria-label="复习任务">
            {activeReviewItems.length === 0 && <p className="muted-state">还没有复习任务。</p>}
            {activeReviewItems.map((item) => (
              <article key={item.id} className="lesson-review-card">
                <p>{item.prompt}</p>
                <label htmlFor={`review-response-${item.id}`}>这次复习回答</label>
                <textarea
                  id={`review-response-${item.id}`}
                  value={reviewResponses[item.id] ?? ''}
                  rows={3}
                  maxLength={1000}
                  disabled={reviewSavingId === item.id}
                  onChange={(event) => onReviewResponseChange(item.id, event.currentTarget.value)}
                />
                <div className="card-actions">
                  <button
                    type="button"
                    disabled={reviewSavingId === item.id}
                    onClick={() => onRecordReview(item.id, 'remembered')}
                  >
                    {reviewSavingId === item.id ? '保存中…' : '记住了'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={reviewSavingId === item.id}
                    onClick={() => onRecordReview(item.id, 'forgot')}
                  >
                    还不稳
                  </button>
                </div>
              </article>
            ))}
            {reviewFeedback && <p className="success-state">{reviewFeedback}</p>}
            {reviewError && (
              <p role="alert" className="error-state">
                {reviewError}
              </p>
            )}
          </section>
        )}

        {activeTab === 'technical' && (
          <section className="lesson-info-section" aria-label="技术记录">
            {session.contextDiagnostics && (
              <article className="lesson-context-diagnostics" aria-label="上下文诊断">
                <h3>上下文预算</h3>
                {session.contextDiagnostics.activeSnapshot === null ? (
                  <p className="muted-state">尚未生成压缩快照。</p>
                ) : (
                  <>
                    <p>
                      {session.contextDiagnostics.activeSnapshot.modelName} · 快照 v
                      {session.contextDiagnostics.activeSnapshot.version}
                    </p>
                    <p>
                      压缩前剩余 {session.contextDiagnostics.activeSnapshot.remainingPercent}% ·
                      触发阈值 {session.contextDiagnostics.activeSnapshot.thresholdPercent}%
                    </p>
                  </>
                )}
                {session.contextDiagnostics.latestJob && (
                  <p>
                    最近整理：{session.contextDiagnostics.latestJob.status}
                    {session.contextDiagnostics.latestJob.errorCode
                      ? ` · ${session.contextDiagnostics.latestJob.errorCode}`
                      : ''}
                  </p>
                )}
              </article>
            )}
            {session.modelRuns.length === 0 && <p className="muted-state">还没有技术记录。</p>}
            {session.modelRuns.map((run) => {
              const step = session.steps.find((entry) => entry.modelRunId === run.id)
              return (
                <article key={run.id} className="lesson-technical-run">
                  <p>
                    {run.modelName} · {run.status}
                  </p>
                  {step && (
                    <p>
                      {step.actionType} · {step.stateBefore} → {step.stateAfter}
                    </p>
                  )}
                  <p>
                    {run.promptManifest.key} v{run.promptManifest.version}
                  </p>
                  <ul>
                    {run.inputSummary.contextChunks.map((chunk) => (
                      <li key={chunk.chunkId}>{formatContextChunkLabel(chunk)}</li>
                    ))}
                  </ul>
                  {run.inputSummary.contextChunks.length === 0 && (
                    <p className="lesson-context-fallback">课堂仍可继续（已降级为 snippet）</p>
                  )}
                </article>
              )
            })}
          </section>
        )}
      </div>
    </aside>
  )
}
