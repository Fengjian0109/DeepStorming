import { useEffect, useState } from 'react'

import { ProviderManager } from '../provider/ProviderManager'

type RuntimeState =
  | { status: 'loading' }
  | { status: 'ready'; version: string; platform: string }
  | { status: 'error'; message: string }

export const App = (): React.JSX.Element => {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: 'loading' })

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
          <a className="nav-item nav-item-active" href="#providers" aria-current="page">
            Provider
          </a>
          <span className="nav-item nav-item-disabled">文档库 · Phase 3</span>
          <span className="nav-item nav-item-disabled">课堂 · Phase 5</span>
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

      <main className="main-content" id="providers">
        <ProviderManager />
      </main>
    </div>
  )
}
