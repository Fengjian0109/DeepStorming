import { redactSensitive } from './redact'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class StructuredLogger {
  public constructor(private readonly scope: string) {}

  public log(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      event,
      context: redactSensitive(context),
    }

    const serialized = JSON.stringify(payload)

    if (level === 'error') {
      console.error(serialized)
      return
    }

    if (level === 'warn') {
      console.warn(serialized)
      return
    }

    console.log(serialized)
  }
}
