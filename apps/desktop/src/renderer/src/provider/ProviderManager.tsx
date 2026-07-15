import type { ProviderDraftDto, ProviderProfileDto } from '@deepstorming/contracts'
import React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { canLeaveSettings } from '../settings/settings-navigation'
import { SettingsPageHeader } from '../settings/SettingsPageHeader'
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

type ProviderView =
  { kind: 'collection' } | { kind: 'create' } | { kind: 'edit'; provider: ProviderProfileDto }

const getErrorMessage = (fallback: string, result?: { ok: false; error: { message: string } }) =>
  result?.error.message ?? fallback

const noopDirtyChange = (_dirty: boolean) => undefined

export const ProviderManager = ({
  onDirtyChange = noopDirtyChange,
}: Readonly<{ onDirtyChange?: (dirty: boolean) => void }>): React.JSX.Element => {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [operationState, setOperationState] = useState<AsyncState>({ status: 'idle' })
  const [activeOperation, setActiveOperation] = useState<ActiveOperation>()
  const [view, setView] = useState<ProviderView>({ kind: 'collection' })
  const [dirty, setDirty] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfileDto>()
  const cancelledTestOperationIds = useRef(new Set<string>())
  const listRequestSequence = useRef(0)
  const nextOperationToken = useRef(0)
  const activeOperationToken = useRef<number | undefined>(undefined)

  const reportDirty = useCallback(
    (nextDirty: boolean) => {
      setDirty(nextDirty)
      onDirtyChange(nextDirty)
    },
    [onDirtyChange],
  )

  const showCollection = useCallback(() => {
    reportDirty(false)
    setView({ kind: 'collection' })
  }, [reportDirty])

  const requestCollection = () => {
    if (!canLeaveSettings(dirty, window.confirm)) return
    showCollection()
  }

  const openCreate = () => {
    setOperationState({ status: 'idle' })
    reportDirty(false)
    setView({ kind: 'create' })
  }

  const openEdit = (provider: ProviderProfileDto) => {
    setOperationState({ status: 'idle' })
    reportDirty(false)
    setView({ kind: 'edit', provider })
  }

  const startOperation = (operation: ActiveOperation): number | undefined => {
    if (activeOperationToken.current !== undefined) return undefined
    const token = nextOperationToken.current + 1
    nextOperationToken.current = token
    activeOperationToken.current = token
    setActiveOperation(operation)
    return token
  }

  const isCurrentOperation = (token: number): boolean => activeOperationToken.current === token

  const clearCurrentOperation = (token: number): boolean => {
    if (!isCurrentOperation(token)) return false
    activeOperationToken.current = undefined
    setActiveOperation(undefined)
    return true
  }

  const loadProviders = useCallback(async () => {
    const requestSequence = listRequestSequence.current + 1
    listRequestSequence.current = requestSequence
    setListState({ status: 'loading' })
    const result = await window.deepstorming.provider.list()
    if (listRequestSequence.current !== requestSequence) return
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
    const editingProvider = view.kind === 'edit' ? view.provider : undefined
    const token = startOperation({ kind: 'save' })
    if (token === undefined) return
    setOperationState({ status: 'loading' })

    const result = editingProvider
      ? await window.deepstorming.provider.update(editingProvider.id, draft)
      : await window.deepstorming.provider.create(draft)
    if (!isCurrentOperation(token)) return
    if (!result.ok) {
      clearCurrentOperation(token)
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 保存失败。', result),
      })
      return
    }

    setOperationState({
      status: 'success',
      message: editingProvider ? 'Provider 已更新。' : 'Provider 已添加。',
    })
    clearCurrentOperation(token)
    showCollection()
    await loadProviders()
  }

  const activateProvider = async (provider: ProviderProfileDto) => {
    const token = startOperation({ kind: 'activate', providerId: provider.id })
    if (token === undefined) return
    setOperationState({ status: 'loading' })

    const result = await window.deepstorming.provider.activate(provider.id)
    if (!isCurrentOperation(token)) return
    if (!result.ok) {
      clearCurrentOperation(token)
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 启用失败。', result),
      })
      return
    }

    setView({ kind: 'edit', provider: result.data })
    setOperationState({ status: 'success', message: 'Provider 已启用。' })
    clearCurrentOperation(token)
    await loadProviders()
  }

  const testProvider = async (provider: ProviderProfileDto) => {
    const operationId = crypto.randomUUID()
    cancelledTestOperationIds.current.delete(operationId)
    const token = startOperation({
      kind: 'test',
      providerId: provider.id,
      providerName: provider.displayName,
      operationId,
    })
    if (token === undefined) return
    setOperationState({ status: 'loading' })

    const result = await window.deepstorming.provider.testConnection(provider.id, operationId)
    if (cancelledTestOperationIds.current.has(operationId)) {
      cancelledTestOperationIds.current.delete(operationId)
      if (!clearCurrentOperation(token)) return
      setOperationState({ status: 'cancelled', message: '测试已取消。' })
      return
    }
    if (!isCurrentOperation(token)) return
    if (!result.ok) {
      clearCurrentOperation(token)
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

    setView({ kind: 'edit', provider: result.data })
    setOperationState({ status: 'success', message: 'Provider 测试成功。' })
    clearCurrentOperation(token)
    await loadProviders()
  }

  const cancelTest = async () => {
    if (activeOperation?.kind !== 'test') return
    const token = activeOperationToken.current
    if (token === undefined) return
    const { operationId } = activeOperation
    const result = await window.deepstorming.provider.cancelTest(operationId)
    if (!clearCurrentOperation(token)) return
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
    const token = startOperation({ kind: 'delete', providerId: deleteTarget.id })
    if (token === undefined) return
    setOperationState({ status: 'loading' })

    const result = await window.deepstorming.provider.remove(deleteTarget.id)
    if (!isCurrentOperation(token)) return
    if (!result.ok) {
      clearCurrentOperation(token)
      setOperationState({
        status: 'error',
        message: getErrorMessage('Provider 删除失败。', result),
      })
      return
    }

    setDeleteTarget(undefined)
    setOperationState({ status: 'success', message: 'Provider 已删除。' })
    clearCurrentOperation(token)
    showCollection()
    await loadProviders()
  }

  const isOperating = activeOperation !== undefined
  const isDeleting = activeOperation?.kind === 'delete'

  const operationFeedback = operationState.status !== 'idle' && (
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
        <button type="button" className="secondary-button" onClick={() => void cancelTest()}>
          取消测试
        </button>
      )}
    </div>
  )

  return (
    <div className="provider-workspace settings-detail-page">
      {view.kind === 'collection' ? (
        <>
          <SettingsPageHeader
            title="AI Provider"
            description="管理模型连接。密钥只会交给安全存储，不会显示在列表中。"
            breadcrumb={['设置', 'AI Provider']}
            action={
              <button type="button" onClick={openCreate} disabled={isOperating}>
                新增 Provider
              </button>
            }
          />
          <main className="settings-page-body provider-main">
            {operationFeedback}
            {listState.status === 'loading' && <p className="muted-state">正在加载 Provider…</p>}
            {listState.status === 'error' && (
              <div className="error-state" role="alert">
                <p>{listState.message}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void loadProviders()}
                >
                  重试加载
                </button>
              </div>
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
                disabled={isOperating}
                onOpen={openEdit}
              />
            )}
          </main>
        </>
      ) : (
        <>
          <SettingsPageHeader
            title={view.kind === 'edit' ? '编辑 Provider' : '新增 Provider'}
            description={
              view.kind === 'edit'
                ? '修改模型、连接地址或安全密钥。留空密钥会保留原值。'
                : '创建一个新的模型连接。'
            }
            breadcrumb={[
              '设置',
              'AI Provider',
              view.kind === 'edit' ? view.provider.displayName : '新增',
            ]}
            onBack={requestCollection}
          />
          <main className="settings-page-body provider-detail">
            {operationFeedback}
            {view.kind === 'edit' && (
              <div className="provider-detail-summary">
                <span className="status-label">
                  {view.provider.hasApiKey ? '已保存密钥' : '未保存密钥'}
                </span>
                {view.provider.isActive && <span className="status-label">启用中</span>}
              </div>
            )}
            <ProviderForm
              mode={view.kind === 'edit' ? 'edit' : 'create'}
              provider={view.kind === 'edit' ? view.provider : undefined}
              disabled={isOperating}
              onSubmit={submitProvider}
              onDirtyChange={reportDirty}
            />
            {view.kind === 'edit' && (
              <div className="provider-detail-actions" aria-label="Provider 操作">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void testProvider(view.provider)}
                  disabled={isOperating}
                >
                  测试连接
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void activateProvider(view.provider)}
                  disabled={isOperating || view.provider.isActive}
                >
                  设为启用
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setDeleteTarget(view.provider)}
                  disabled={isOperating}
                >
                  删除 Provider
                </button>
              </div>
            )}
          </main>
        </>
      )}

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
              <button
                type="button"
                className="danger-button"
                onClick={() => void deleteProvider()}
                disabled={isDeleting}
              >
                确认删除
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteTarget(undefined)}
                disabled={isDeleting}
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
