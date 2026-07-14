import React, { useEffect, useState } from 'react'

import { DocumentLibrary, type DocumentEvidenceFocus } from '../document/DocumentLibrary'
import { LessonWorkspace } from '../lesson/LessonWorkspace'
import { ProviderManager } from '../provider/ProviderManager'
import { WorkspaceContextual, WorkspaceShell, type WorkspacePage } from './WorkspaceShell'

type RuntimeState =
  | { status: 'loading' }
  | { status: 'ready'; version: string; platform: string }
  | { status: 'error'; message: string }

const contextualLabels: Readonly<Record<WorkspacePage, string>> = {
  documents: '文档导航',
  lessons: '课堂与课程记录',
  settings: '设置分类',
}

export const App = (): React.JSX.Element => {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: 'loading' })
  const [page, setPage] = useState<WorkspacePage>('documents')
  const [selectedLessonId, setSelectedLessonId] = useState<string>()
  const [focusTarget, setFocusTarget] = useState<DocumentEvidenceFocus>()

  useEffect(() => {
    let active = true

    void window.deepstorming.app.getInfo().then((result) => {
      if (!active) return

      if (result.ok) {
        setRuntime({
          status: 'ready',
          version: result.data.version,
          platform: result.data.platform,
        })
        return
      }

      setRuntime({ status: 'error', message: result.error.message })
    })

    return () => {
      active = false
    }
  }, [])

  const primaryHeader = (
    <>
      <div>
        <p className="brand-mark">DS</p>
        <p className="brand-name">DeepStorming</p>
      </div>
      <div className="runtime-card" aria-live="polite">
        {runtime.status === 'loading' && <span>正在连接桌面核心…</span>}
        {runtime.status === 'ready' && (
          <span data-testid="app-version">
            v{runtime.version} · {runtime.platform}
          </span>
        )}
        {runtime.status === 'error' && <span role="alert">{runtime.message}</span>}
      </div>
    </>
  )

  return (
    <WorkspaceShell
      page={page}
      onNavigate={setPage}
      primaryHeader={primaryHeader}
      contextualLabel={contextualLabels[page]}
    >
      {page === 'documents' && (
        <DocumentLibrary
          focusTarget={focusTarget}
          onFocusConsumed={() => setFocusTarget(undefined)}
          onLessonStarted={(lessonId) => {
            setSelectedLessonId(lessonId)
            setPage('lessons')
          }}
        />
      )}
      {page === 'lessons' && (
        <LessonWorkspace
          selectedLessonId={selectedLessonId}
          onReturnToEvidence={(target) => {
            setFocusTarget(target)
            setPage('documents')
          }}
        />
      )}
      {page === 'settings' && (
        <>
          <WorkspaceContextual>
            <nav aria-label="设置分类" className="settings-contextual-navigation">
              <span aria-current="page">模型与 Provider</span>
            </nav>
          </WorkspaceContextual>
          <ProviderManager />
        </>
      )}
    </WorkspaceShell>
  )
}
