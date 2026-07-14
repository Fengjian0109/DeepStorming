import type { LessonSessionDto } from '@deepstorming/contracts'
import React from 'react'

export type LessonSessionGroup = Readonly<{
  documentId: string
  documentTitle: string
  sessions: readonly LessonSessionDto[]
}>

export const groupLessonSessions = (
  sessions: readonly LessonSessionDto[],
): readonly LessonSessionGroup[] => {
  const groups = new Map<string, LessonSessionDto[]>()
  for (const session of sessions) {
    groups.set(session.documentId, [...(groups.get(session.documentId) ?? []), session])
  }

  return [...groups.entries()]
    .map(([documentId, entries]) => ({
      documentId,
      documentTitle: entries[0]?.documentTitle ?? '未命名文档',
      sessions: [...entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }))
    .sort((left, right) => left.documentTitle.localeCompare(right.documentTitle, 'zh-CN'))
}

type LessonSessionTreeProps = Readonly<{
  sessions: readonly LessonSessionDto[]
  selectedLessonId?: string | undefined
  onSelect: (lessonId: string) => void
  state?: 'ready' | 'empty' | 'loading' | 'error'
  errorMessage?: string | undefined
  onRetry?: (() => void) | undefined
}>

const statusLabel = (status: LessonSessionDto['status']): string =>
  status === 'active' ? '进行中' : '已归档'

export const LessonSessionTree = ({
  sessions,
  selectedLessonId,
  onSelect,
  state = sessions.length === 0 ? 'empty' : 'ready',
  errorMessage,
  onRetry,
}: LessonSessionTreeProps): React.JSX.Element => {
  if (state === 'loading') return <p className="muted-state">正在加载课堂…</p>
  if (state === 'error') {
    return (
      <div className="lesson-tree-state">
        <p role="alert" className="error-state">
          {errorMessage ?? '课堂加载失败。'}
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            重试加载
          </button>
        )}
      </div>
    )
  }
  if (state === 'empty' || sessions.length === 0) {
    return <p className="muted-state">还没有课堂记录。</p>
  }

  return (
    <div className="lesson-session-tree">
      {groupLessonSessions(sessions).map((group) => (
        <details
          key={group.documentId}
          className="lesson-session-group"
          open={group.sessions.some((session) => session.id === selectedLessonId)}
        >
          <summary>
            <h3>{group.documentTitle}</h3>
            <span>{group.sessions.length}</span>
          </summary>
          <div className="lesson-session-children">
            {group.sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                aria-label={`${session.title} · ${statusLabel(session.status)}`}
                aria-current={session.id === selectedLessonId ? 'page' : undefined}
                onClick={() => onSelect(session.id)}
              >
                <span>{session.title}</span>
                <small>{statusLabel(session.status)}</small>
              </button>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
