import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false }

  public static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('renderer.error_boundary', {
      error: error.message,
      componentStack: info.componentStack,
    })
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="fatal-state" role="alert">
          <p className="eyebrow">DeepStorming</p>
          <h1>界面暂时无法继续</h1>
          <p>请重新启动应用。如果问题持续存在，后续可通过诊断导出提供脱敏日志。</p>
        </main>
      )
    }

    return this.props.children
  }
}
