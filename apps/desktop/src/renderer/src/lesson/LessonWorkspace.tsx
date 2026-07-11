import type { LessonSessionDto } from '@deepstorming/contracts'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type LessonListState =
  | { status: 'loading' }
  | { status: 'ready'; sessions: LessonSessionDto[] }
  | { status: 'error'; message: string }

type LessonDetailState =
  | { status: 'idle' }
  | { status: 'loading'; lessonId: string }
  | { status: 'ready'; session: LessonSessionDto }
  | { status: 'error'; message: string }

export const LessonWorkspace = ({
  selectedLessonId,
}: {
  selectedLessonId: string | undefined
}): React.JSX.Element => {
  const [listState, setListState] = useState<LessonListState>({ status: 'loading' })
  const [detailState, setDetailState] = useState<LessonDetailState>({ status: 'idle' })
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

  useEffect(() => {
    void loadLessons()
  }, [loadLessons])

  return (
    <div className="provider-workspace">
      <section className="workspace-header" aria-labelledby="lesson-title">
        <div>
          <p className="section-kicker">LESSONS</p>
          <h1 id="lesson-title">课堂</h1>
          <p>从文档证据启动本地课堂会话，后续会接入 AI 导师状态机。</p>
        </div>
      </section>

      <div className="lesson-layout">
        <main className="panel">
          <div className="panel-header">
            <h2>课堂会话</h2>
            {listState.status === 'error' && (
              <button type="button" className="secondary-button" onClick={() => void loadLessons()}>
                重试加载
              </button>
            )}
          </div>

          {listState.status === 'loading' && <p className="muted-state">正在加载课堂…</p>}
          {listState.status === 'error' && (
            <p role="alert" className="error-state">
              {listState.message}
            </p>
          )}
          {listState.status === 'ready' && listState.sessions.length === 0 && (
            <div className="empty-state">
              <h3>还没有课堂</h3>
              <p>从文档详情或搜索结果开始第一节课。</p>
            </div>
          )}
          {listState.status === 'ready' && listState.sessions.length > 0 && (
            <div className="provider-list">
              {listState.sessions.map((session) => (
                <article key={session.id} className="document-card">
                  <div className="provider-card-header">
                    <div>
                      <h3>{session.title}</h3>
                      <p>{session.documentTitle}</p>
                    </div>
                    <span className="status-label">
                      {session.status === 'active' ? '进行中' : '已归档'}
                    </span>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void openLesson(session.id)}
                    >
                      打开 {session.title}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>

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
              <div className="lesson-anchor-list">
                {detailState.session.sourceAnchors.map((anchor) => (
                  <blockquote key={anchor.id} className="lesson-anchor">
                    <p>{anchor.snippet}</p>
                    <footer>
                      字符 {anchor.startOffset}–{anchor.endOffset}
                    </footer>
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
                {detailState.session.modelRuns.map((modelRun) => (
                  <article key={modelRun.id} className="lesson-run">
                    <p>
                      {modelRun.modelName} · {modelRun.status}
                    </p>
                    <footer>
                      {modelRun.promptManifest.key} v{modelRun.promptManifest.version}
                    </footer>
                  </article>
                ))}
                {detailState.session.modelRuns.length === 0 && (
                  <p className="muted-state">这节课还没有生成记录。</p>
                )}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}
