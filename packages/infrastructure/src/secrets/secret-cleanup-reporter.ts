import type { SecretCleanupReporterPort } from '@deepstorming/application'
import type { LogLevel } from '../logging/structured-logger'

export interface CleanupLogger {
  log(level: LogLevel, event: string, context: Record<string, unknown>): void
}

export class SecretCleanupReporter implements SecretCleanupReporterPort {
  public constructor(private readonly logger: CleanupLogger) {}

  public reportFailure(
    failure: Readonly<{ secretRef: string; code: 'SECRET_DELETE_FAILED' }>,
  ): void {
    try {
      this.logger.log('error', 'secret_cleanup_failed', {
        code: failure.code,
        secretRef: failure.secretRef,
      })
    } catch {
      // Reporting is a guaranteed nonthrow boundary; no secondary sink receives sensitive data.
      return
    }
  }
}
