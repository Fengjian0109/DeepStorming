import { useEffect, useState } from 'react'

import { DocumentLibrary, type DocumentEvidenceFocus } from '../document/DocumentLibrary'
import { LessonWorkspace } from '../lesson/LessonWorkspace'
import { ProviderManager } from '../provider/ProviderManager'

type RuntimeState =
  | { status: 'loading' }
  | { status: 'ready'; version: string; platform: string }
  | { status: 'error'; message: string }

export const App = (): React.JSX.Element => {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: 'loading' })
  const [page, setPage] = useState<'documents' | 'lessons' | 'providers'>('documents')
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

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div>
          <p className="brand-mark">DS</p>
          <p className="brand-name">DeepStorming</p>
        </div>
        <nav>
          <button
            type="button"
            className={`nav-item ${page === 'documents' ? 'nav-item-active' : ''}`}
            aria-current={page === 'documents' ? 'page' : undefined}
            onClick={() => setPage('documents')}
          >
            文档库
          </button>
          <button
            type="button"
            className={`nav-item ${page === 'providers' ? 'nav-item-active' : ''}`}
            aria-current={page === 'providers' ? 'page' : undefined}
            onClick={() => setPage('providers')}
          >
            Provider
          </button>
          <button
            type="button"
            className={`nav-item ${page === 'lessons' ? 'nav-item-active' : ''}`}
            aria-current={page === 'lessons' ? 'page' : undefined}
            onClick={() => setPage('lessons')}
          >
            课堂
          </button>
          <span className="nav-item nav-item-disabled">复习 · Phase 6</span>
          <span className="nav-item nav-item-disabled">论文 · Phase 7</span>
        </nav>
        <div className="runtime-card" aria-live="polite">
          {runtime.status === 'loading' && <span>正在连接桌面核心…</span>}
          {runtime.status === 'ready' && (
            <span data-testid="app-version">
              v{runtime.version} · {runtime.platform}
            </span>
          )}
          {runtime.status === 'error' && <span role="alert">{runtime.message}</span>}
        </div>
      </aside>

      <main className="main-content" id={page}>
        {page === 'documents' && (
          <DocumentLibrary
            focusTarget={focusTarget}
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
        {page === 'providers' && <ProviderManager />}
      </main>
    </div>
  )
}
