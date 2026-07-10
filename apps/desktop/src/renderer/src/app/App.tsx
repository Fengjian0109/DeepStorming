import { useEffect, useState } from 'react'

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
          <a className="nav-item nav-item-active" href="#home" aria-current="page">
            首页
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

      <main className="main-content" id="home">
        <section className="hero-card">
          <p className="eyebrow">PHASE 0–1 · FOUNDATION</p>
          <h1>让理解发生，而不只是得到答案。</h1>
          <p className="hero-copy">
            DeepStorming 正在建立可靠的桌面基础：安全
            IPC、清晰模块边界、可测试错误模型和可恢复任务。
          </p>
          <div className="status-row">
            <span className="status-dot" aria-hidden="true" />
            <span>工程骨架已加载</span>
          </div>
        </section>

        <section className="principles" aria-labelledby="principles-title">
          <div>
            <p className="section-kicker">BUILD RULES</p>
            <h2 id="principles-title">这次重建从边界开始</h2>
          </div>
          <div className="principle-grid">
            <article>
              <strong>证据优先</strong>
              <p>未来的每个教学结论都要能回到教材或论文原页。</p>
            </article>
            <article>
              <strong>无静默失败</strong>
              <p>每个异步动作都有加载、成功、错误或取消状态。</p>
            </article>
            <article>
              <strong>模块解耦</strong>
              <p>界面不碰数据库，领域层不依赖 Electron 或模型 SDK。</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}
