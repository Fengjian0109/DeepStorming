import { expect, test } from 'vitest'

import { ProviderUseCaseError, type CancellationToken } from '@deepstorming/application'

import { MockProviderGateway } from './mock-provider-gateway'

const liveToken = (): CancellationToken => ({ cancelled: false, onCancel: () => () => undefined })

test.each([
  ['mock-success', undefined],
  ['mock-auth', 'PROVIDER_AUTH_FAILED'],
  ['mock-rate-limit', 'PROVIDER_RATE_LIMITED'],
  ['mock-model-not-found', 'PROVIDER_MODEL_NOT_FOUND'],
  ['mock-invalid', 'PROVIDER_RESPONSE_INVALID'],
] as const)('maps deterministic mock model %s', async (modelName, code) => {
  const action = new MockProviderGateway().testConnection({ modelName }, liveToken())
  if (code === undefined) {
    await expect(action).resolves.toBeUndefined()
  } else {
    await expect(action).rejects.toMatchObject({ code })
  }
})

test('honors cancellation while mock-delay is pending', async () => {
  let listener: (() => void) | undefined
  const token: CancellationToken = {
    get cancelled() {
      return listener === undefined ? false : true
    },
    onCancel: (next) => {
      listener = next
      return () => undefined
    },
  }
  const pending = new MockProviderGateway({ delayMs: 60_000 }).testConnection(
    { modelName: 'mock-delay' },
    token,
  )
  listener?.()
  await expect(pending).rejects.toEqual(
    new ProviderUseCaseError('OPERATION_CANCELLED', 'The provider test was cancelled.', false),
  )
})
