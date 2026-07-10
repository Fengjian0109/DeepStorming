import { expect, test, vi } from 'vitest'
import { SecretCleanupReporter } from './secret-cleanup-reporter'

test('logs only the stable cleanup allowlist', () => {
  const log = vi.fn()
  new SecretCleanupReporter({ log }).reportFailure({
    secretRef: '123e4567-e89b-42d3-a456-426614174000.secret',
    code: 'SECRET_DELETE_FAILED',
  })
  expect(log).toHaveBeenCalledWith('error', 'secret_cleanup_failed', {
    code: 'SECRET_DELETE_FAILED',
    secretRef: '123e4567-e89b-42d3-a456-426614174000.secret',
  })
})

test('does not throw across its reporting boundary when the logger fails', () => {
  const reporter = new SecretCleanupReporter({
    log: () => {
      throw new Error('sensitive logger detail')
    },
  })
  expect(() =>
    reporter.reportFailure({ secretRef: 'safe-ref', code: 'SECRET_DELETE_FAILED' }),
  ).not.toThrow()
})
