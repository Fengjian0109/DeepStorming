// @vitest-environment jsdom

import type {
  AppInfoResult,
  CancelProviderTestResult,
  DeepStormingBootstrapApi,
  ListProvidersResult,
  ProviderDraftDto,
  ProviderProfileDto,
  ProviderResult,
  VoidResult,
} from '@deepstorming/contracts'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderManager } from './ProviderManager'

const requestId = 'request-1'
const providerId = '11111111-1111-4111-8111-111111111111'
const operationId = '22222222-2222-4222-8222-222222222222'

const capabilities = {
  streaming: true,
  structuredOutput: true,
  embedding: false,
  vision: false,
}

const provider = (overrides: Partial<ProviderProfileDto> = {}): ProviderProfileDto => ({
  id: providerId,
  providerType: 'openai_compatible',
  displayName: 'Local Router',
  baseUrl: 'https://api.example.test/v1',
  modelName: 'router-model',
  hasApiKey: true,
  capabilities,
  isActive: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const okList = (data: ProviderProfileDto[]): ListProvidersResult => ({
  ok: true,
  data,
  requestId,
})

const okProvider = (data: ProviderProfileDto): ProviderResult => ({ ok: true, data, requestId })
const okVoid = (): VoidResult => ({ ok: true, data: {}, requestId })
const okCancel = (cancelled: boolean): CancelProviderTestResult => ({
  ok: true,
  data: { cancelled },
  requestId,
})

const errorResult = <T,>(message: string): T =>
  ({
    ok: false,
    error: { code: 'PROVIDER_NETWORK_ERROR', message, retryable: true },
    requestId,
  }) as T

const deferred = <T,>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

const installApi = (overrides: Partial<DeepStormingBootstrapApi['provider']> = {}) => {
  const api: DeepStormingBootstrapApi = {
    app: {
      getInfo: vi.fn<DeepStormingBootstrapApi['app']['getInfo']>().mockResolvedValue({
        ok: true,
        data: { name: 'DeepStorming', version: '0.0.0-test', platform: 'linux' },
        requestId,
      } satisfies AppInfoResult),
    },
    provider: {
      list: vi.fn<DeepStormingBootstrapApi['provider']['list']>().mockResolvedValue(okList([])),
      create: vi
        .fn<DeepStormingBootstrapApi['provider']['create']>()
        .mockImplementation(async (draft) =>
          okProvider(provider({ ...draft, hasApiKey: Boolean(draft.apiKey) })),
        ),
      update: vi
        .fn<DeepStormingBootstrapApi['provider']['update']>()
        .mockImplementation(async (_id, draft) => okProvider(provider({ ...draft }))),
      remove: vi.fn<DeepStormingBootstrapApi['provider']['remove']>().mockResolvedValue(okVoid()),
      activate: vi
        .fn<DeepStormingBootstrapApi['provider']['activate']>()
        .mockResolvedValue(okProvider(provider({ isActive: true }))),
      testConnection: vi
        .fn<DeepStormingBootstrapApi['provider']['testConnection']>()
        .mockResolvedValue(okProvider(provider({ lastTestStatus: 'success' }))),
      cancelTest: vi
        .fn<DeepStormingBootstrapApi['provider']['cancelTest']>()
        .mockResolvedValue(okCancel(true)),
      ...overrides,
    },
  }

  vi.stubGlobal('deepstorming', api)
  return api
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => operationId) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProviderManager', () => {
  it('loads providers and shows empty onboarding for adding the first provider', async () => {
    installApi()

    render(<ProviderManager />)

    expect(screen.getByText('正在加载 Provider…')).toBeTruthy()
    expect(await screen.findByText('还没有 Provider')).toBeTruthy()
    expect(screen.getByText('添加第一个 Provider 以开始连接模型。')).toBeTruthy()
    expect(screen.getByLabelText('Provider 类型')).toBeTruthy()
    expect(screen.getByRole('button', { name: '添加 Provider' })).toBeTruthy()
  })

  it('creates a provider with loading and success text states, then clears the key field', async () => {
    const createRequest = deferred<ProviderResult>()
    const api = installApi({
      create: vi
        .fn<DeepStormingBootstrapApi['provider']['create']>()
        .mockReturnValue(createRequest.promise),
      list: vi
        .fn<DeepStormingBootstrapApi['provider']['list']>()
        .mockResolvedValueOnce(okList([]))
        .mockResolvedValueOnce(
          okList([provider({ displayName: 'DeepSeek Workbench', providerType: 'deepseek' })]),
        ),
    })
    const user = userEvent.setup()

    render(<ProviderManager />)
    await screen.findByText('还没有 Provider')

    await user.selectOptions(screen.getByLabelText('Provider 类型'), 'deepseek')
    await user.type(screen.getByLabelText('显示名称'), 'DeepSeek Workbench')
    await user.clear(screen.getByLabelText('模型名称'))
    await user.type(screen.getByLabelText('模型名称'), 'deepseek-chat')
    await user.type(screen.getByLabelText('API Key'), 'sk-secret-value')
    await user.click(screen.getByRole('button', { name: '添加 Provider' }))

    expect(screen.getByText('正在保存 Provider…')).toBeTruthy()
    expect(api.provider.create).toHaveBeenCalledWith({
      providerType: 'deepseek',
      displayName: 'DeepSeek Workbench',
      modelName: 'deepseek-chat',
      apiKey: 'sk-secret-value',
    })

    createRequest.resolve(
      okProvider(provider({ displayName: 'DeepSeek Workbench', providerType: 'deepseek' })),
    )

    expect(await screen.findByText('Provider 已添加。')).toBeTruthy()
    expect(screen.getByLabelText('API Key')).toHaveProperty('value', '')
    expect(await screen.findByText('DeepSeek Workbench')).toBeTruthy()
  })

  it('shows safe error text when list or save fails', async () => {
    const api = installApi({
      list: vi
        .fn<DeepStormingBootstrapApi['provider']['list']>()
        .mockResolvedValueOnce(errorResult<ListProvidersResult>('无法读取 Provider 列表。'))
        .mockResolvedValueOnce(okList([])),
      create: vi
        .fn<DeepStormingBootstrapApi['provider']['create']>()
        .mockResolvedValueOnce(errorResult<ProviderResult>('Provider 验证失败。')),
    })
    const user = userEvent.setup()

    render(<ProviderManager />)

    expect((await screen.findByRole('alert')).textContent).toContain('无法读取 Provider 列表。')

    await user.click(screen.getByRole('button', { name: '重试加载' }))
    await screen.findByText('还没有 Provider')
    await user.selectOptions(screen.getByLabelText('Provider 类型'), 'mock')
    await user.type(screen.getByLabelText('显示名称'), 'Mock Lab')
    await user.type(screen.getByLabelText('模型名称'), 'mock-invalid')
    await user.click(screen.getByRole('button', { name: '添加 Provider' }))

    expect(api.provider.create).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('alert')).textContent).toContain('Provider 验证失败。')
  })

  it('edits without resending an empty key and labels the retain-key behavior', async () => {
    const api = installApi({
      list: vi
        .fn<DeepStormingBootstrapApi['provider']['list']>()
        .mockResolvedValue(okList([provider()])),
    })
    const user = userEvent.setup()

    render(<ProviderManager />)
    await screen.findByText('Local Router')

    await user.click(screen.getByRole('button', { name: '编辑 Local Router' }))

    expect(screen.getByLabelText('API Key（留空则保留原密钥）')).toBeTruthy()
    expect(screen.getByText('留空则保留原密钥')).toBeTruthy()

    await user.clear(screen.getByLabelText('显示名称'))
    await user.type(screen.getByLabelText('显示名称'), 'Router Edited')
    await user.click(screen.getByRole('button', { name: '保存更改' }))

    expect(api.provider.update).toHaveBeenCalledWith(providerId, {
      providerType: 'openai_compatible',
      displayName: 'Router Edited',
      baseUrl: 'https://api.example.test/v1',
      modelName: 'router-model',
    } satisfies ProviderDraftDto)
  })

  it('tests a connection with a generated operation id and supports cancellation', async () => {
    const testRequest = deferred<ProviderResult>()
    const api = installApi({
      list: vi
        .fn<DeepStormingBootstrapApi['provider']['list']>()
        .mockResolvedValue(okList([provider()])),
      testConnection: vi
        .fn<DeepStormingBootstrapApi['provider']['testConnection']>()
        .mockReturnValue(testRequest.promise),
    })
    const user = userEvent.setup()

    render(<ProviderManager />)
    await screen.findByText('Local Router')

    await user.click(screen.getByRole('button', { name: '测试 Local Router' }))

    expect(api.provider.testConnection).toHaveBeenCalledWith(providerId, operationId)
    expect(screen.getByText('正在测试 Local Router…')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消测试' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '添加 Provider' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '编辑 Local Router' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByRole('button', { name: '删除 Local Router' })).toHaveProperty(
      'disabled',
      true,
    )

    await user.click(screen.getByRole('button', { name: '取消测试' }))

    expect(api.provider.cancelTest).toHaveBeenCalledWith(operationId)
    expect(await screen.findByText('测试已取消。')).toBeTruthy()

    await act(async () => {
      testRequest.resolve(okProvider(provider({ lastTestStatus: 'cancelled' })))
      await testRequest.promise
    })
    expect(screen.getByText('测试已取消。')).toBeTruthy()
  })

  it('activates providers and deletes only after explicit confirmation', async () => {
    const api = installApi({
      list: vi
        .fn<DeepStormingBootstrapApi['provider']['list']>()
        .mockResolvedValueOnce(okList([provider()]))
        .mockResolvedValueOnce(okList([provider({ isActive: true })]))
        .mockResolvedValueOnce(okList([])),
    })
    const user = userEvent.setup()

    render(<ProviderManager />)
    await screen.findByText('Local Router')

    await user.click(screen.getByRole('button', { name: '设为启用 Local Router' }))
    expect(api.provider.activate).toHaveBeenCalledWith(providerId)
    expect(await screen.findByText('Provider 已启用。')).toBeTruthy()
    expect(await screen.findByText('启用中')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '删除 Local Router' }))

    const dialog = screen.getByRole('dialog', { name: '确认删除 Provider' })
    expect(within(dialog).getByText('删除后需要重新添加密钥才能恢复。')).toBeTruthy()
    expect(api.provider.remove).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: '确认删除' }))

    expect(api.provider.remove).toHaveBeenCalledWith(providerId)
    expect(await screen.findByText('Provider 已删除。')).toBeTruthy()
    expect(await screen.findByText('还没有 Provider')).toBeTruthy()
  })
})
