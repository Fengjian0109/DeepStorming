import type { ProviderDraftDto, ProviderProfileDto } from '@deepstorming/contracts'
import React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ProviderForm } from './ProviderForm'
import { ProviderList } from './ProviderList'

type AsyncState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }
  | { status: 'cancelled'; message: string }

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; providers: ProviderProfileDto[] }
  | { status: 'error'; message: string }

type ActiveOperation =
  | { kind: 'save' }
  | { kind: 'activate'; providerId: string }
  | { kind: 'delete'; providerId: string }
  | { kind: 'test'; providerId: string; providerName: string; operationId: string }

const getErrorMessage = (fallback: string, result?: { ok: false; error: { message: string } }) =>
  result?.error.message ?? fallback

export const ProviderManager = (): React.JSX.Element => {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [operationState, setOperationState] = useState<AsyncState>({ status: 'idle' })
  const [activeOperation, setActiveOperation] = useState<ActiveOperation>()
  const [editingProvider, setEditingProvider] = useState<ProviderProfileDto>()
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfileDto>()
  const cancelledTestOperationIds = useRef(new Set<string>())

  const loadProviders = useCallback(async () => {
    setListState({ status: 'loading' })
    const result = await window.deepstorming.provider.list()
    if (result.ok) {
      setListState({ status: 'ready', providers: result.data })
      return
    }

    setListState({ status: 'error', message: result.error.message })
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const submitProvider = async (draft: ProviderDraftDto) => {
    setActiveOperation({ kind: 'save' })
    setOperationState({ status: 'loading' })

    const result = editingProvider
      ? await window.deepstorming.provider.update(editingProvider.id, draft)
      : await window.deepstorming.provider.create(draft)

    if (!result.ok) {
      setActiveOperation(undefined)
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 保存失败。', result),
      })
      return
    }

    setEditingProvider(undefined)
    setOperationState({
      status: 'success',
      message: editingProvider ? 'Provider 已更新。' : 'Provider 已添加。',
    })
    setActiveOperation(undefined)
    await loadProviders()
  }

  const activateProvider = async (provider: ProviderProfileDto) => {
    setActiveOperation({ kind: 'activate', providerId: provider.id })
    setOperationState({ status: 'loading' })

    const result = await window.deepstorming.provider.activate(provider.id)
    if (!result.ok) {
      setActiveOperation(undefined)
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 启用失败。', result),
      })
      return
    }

    setOperationState({ status: 'success', message: 'Provider 已启用。' })
    setActiveOperation(undefined)
    await loadProviders()
  }

  const testProvider = async (provider: ProviderProfileDto) => {
    const operationId = crypto.randomUUID()
    cancelledTestOperationIds.current.delete(operationId)
    setActiveOperation({
      kind: 'test',
      providerId: provider.id,
      providerName: provider.displayName,
      operationId,
    })
    setOperationState({ status: 'loading' })

    const result = await window.deepstorming.provider.testConnection(provider.id, operationId)
    if (cancelledTestOperationIds.current.has(operationId)) {
      cancelledTestOperationIds.current.delete(operationId)
      setActiveOperation(undefined)
      setOperationState({ status: 'cancelled', message: '测试已取消。' })
      return
    }

    if (!result.ok) {
      setActiveOperation(undefined)
      if (result.error.code === 'OPERATION_CANCELLED') {
        setOperationState({ status: 'cancelled', message: '测试已取消。' })
        return
      }
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 测试失败。', result),
      })
      return
    }

    setOperationState({ status: 'success', message: 'Provider 测试成功。' })
    setActiveOperation(undefined)
    await loadProviders()
  }

  const cancelTest = async () => {
    if (activeOperation?.kind !== 'test') return
    const { operationId } = activeOperation
    const result = await window.deepstorming.provider.cancelTest(operationId)
    setActiveOperation(undefined)
    if (result.ok && result.data.cancelled) {
      cancelledTestOperationIds.current.add(operationId)
      setOperationState({ status: 'cancelled', message: '测试已取消。' })
      return
    }

    setOperationState({
      status: 'error',
      message: result.ok ? '测试取消请求未生效。' : result.error.message,
    })
  }

  const deleteProvider = async () => {
    if (!deleteTarget) return
    setActiveOperation({ kind: 'delete', providerId: deleteTarget.id })
    setOperationState({ status: 'loading' })

    const result = await window.deepstorming.provider.remove(deleteTarget.id)
    if (!result.ok) {
      setActiveOperation(undefined)
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 删除失败。', result),
      })
      return
    }

    setDeleteTarget(undefined)
    setEditingProvider((current) => (current?.id === deleteTarget.id ? undefined : current))
    setOperationState({ status: 'success', message: 'Provider 已删除。' })
    setActiveOperation(undefined)
    await loadProviders()
  }

  const isSaving = activeOperation?.kind === 'save'
  const busyProviderId =
    activeOperation?.kind === 'activate' || activeOperation?.kind === 'delete'
      ? activeOperation.providerId
      : undefined
  const testingProviderId =
    activeOperation?.kind === 'test' ? activeOperation.providerId : undefined

  return (
    <div className="provider-workspace">
      <section className="workspace-header" aria-labelledby="provider-title">
        <div>
          <p className="section-kicker">PROVIDERS</p>
          <h1 id="provider-title">Provider 管理</h1>
          <p>配置模型 Provider、验证连接，并选择当前启用的模型入口。</p>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="panel">
          <h2>{editingProvider ? '编辑 Provider' : '添加 Provider'}</h2>
          <ProviderForm
            mode={editingProvider ? 'edit' : 'create'}
            provider={editingProvider}
            disabled={isSaving}
            onSubmit={submitProvider}
            onCancelEdit={() => setEditingProvider(undefined)}
          />
        </aside>

        <main className="panel provider-main">
          <div className="panel-header">
            <h2>Provider 列表</h2>
            {listState.status === 'error' && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadProviders()}
              >
                重试加载
              </button>
            )}
          </div>

          {operationState.status !== 'idle' && (
            <div
              className={`operation-state operation-state-${operationState.status}`}
              role={operationState.status === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {operationState.status === 'loading' && activeOperation?.kind === 'test'
                ? `正在测试 ${activeOperation.providerName}…`
                : null}
              {operationState.status === 'loading' && activeOperation?.kind !== 'test'
                ? '正在保存 Provider…'
                : null}
              {operationState.status !== 'loading' ? operationState.message : null}
              {activeOperation?.kind === 'test' && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void cancelTest()}
                >
                  取消测试
                </button>
              )}
            </div>
          )}

          {listState.status === 'loading' && <p className="muted-state">正在加载 Provider…</p>}

          {listState.status === 'error' && (
            <p role="alert" className="error-state">
              {listState.message}
            </p>
          )}

          {listState.status === 'ready' && listState.providers.length === 0 && (
            <div className="empty-state">
              <h3>还没有 Provider</h3>
              <p>添加第一个 Provider 以开始连接模型。</p>
            </div>
          )}

          {listState.status === 'ready' && listState.providers.length > 0 && (
            <ProviderList
              providers={listState.providers}
              testingProviderId={testingProviderId}
              busyProviderId={busyProviderId}
              onEdit={setEditingProvider}
              onActivate={(provider) => void activateProvider(provider)}
              onTest={(provider) => void testProvider(provider)}
              onDelete={setDeleteTarget}
            />
          )}
        </main>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="确认删除 Provider"
          >
            <h2>确认删除 Provider</h2>
            <p>删除 {deleteTarget.displayName}？</p>
            <p>删除后需要重新添加密钥才能恢复。</p>
            <div className="form-actions">
              <button type="button" className="danger-button" onClick={() => void deleteProvider()}>
                确认删除
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteTarget(undefined)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
