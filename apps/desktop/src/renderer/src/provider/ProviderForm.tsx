import type { ProviderDraftDto, ProviderProfileDto, ProviderTypeDto } from '@deepstorming/contracts'
import React from 'react'
import { useEffect, useState } from 'react'

export type ProviderFormMode = 'create' | 'edit'

type ProviderFormProps = Readonly<{
  mode: ProviderFormMode
  provider?: ProviderProfileDto | undefined
  disabled?: boolean | undefined
  onSubmit: (provider: ProviderDraftDto) => Promise<void>
  onCancelEdit?: (() => void) | undefined
}>

const providerLabels: Record<ProviderTypeDto, string> = {
  mock: 'Mock',
  deepseek: 'DeepSeek',
  openai_compatible: 'OpenAI Compatible',
}

const defaultModel: Record<ProviderTypeDto, string> = {
  mock: 'mock-success',
  deepseek: 'deepseek-chat',
  openai_compatible: '',
}

export const ProviderForm = ({
  mode,
  provider,
  disabled = false,
  onSubmit,
  onCancelEdit,
}: ProviderFormProps): React.JSX.Element => {
  const [providerType, setProviderType] = useState<ProviderTypeDto>(
    provider?.providerType ?? 'mock',
  )
  const [displayName, setDisplayName] = useState(provider?.displayName ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [modelName, setModelName] = useState(provider?.modelName ?? defaultModel[providerType])
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    setProviderType(provider?.providerType ?? 'mock')
    setDisplayName(provider?.displayName ?? '')
    setBaseUrl(provider?.baseUrl ?? '')
    setModelName(provider?.modelName ?? defaultModel[provider?.providerType ?? 'mock'])
    setApiKey('')
  }, [provider])

  const isEdit = mode === 'edit'
  const showBaseUrl = providerType === 'openai_compatible'
  const apiKeyLabel = isEdit ? 'API Key（留空则保留原密钥）' : 'API Key'

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const draft: ProviderDraftDto = {
      providerType,
      displayName: displayName.trim(),
      modelName: modelName.trim(),
      ...(showBaseUrl && baseUrl.trim().length > 0 ? { baseUrl: baseUrl.trim() } : {}),
      ...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
    }

    await onSubmit(draft)
    setApiKey('')
  }

  return (
    <form
      className="provider-form"
      aria-label={isEdit ? '编辑 Provider' : '添加 Provider'}
      onSubmit={submit}
    >
      <div className="form-grid">
        <label>
          <span>Provider 类型</span>
          <select
            value={providerType}
            onChange={(event) => {
              const nextType = event.currentTarget.value as ProviderTypeDto
              setProviderType(nextType)
              if (!modelName.trim() || modelName === defaultModel[providerType]) {
                setModelName(defaultModel[nextType])
              }
              if (nextType !== 'openai_compatible') setBaseUrl('')
            }}
            disabled={disabled}
          >
            {Object.entries(providerLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>显示名称</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            disabled={disabled}
            required
          />
        </label>

        {showBaseUrl && (
          <label>
            <span>Base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.currentTarget.value)}
              placeholder="https://api.example.com/v1"
              disabled={disabled}
            />
          </label>
        )}

        <label>
          <span>模型名称</span>
          <input
            value={modelName}
            onChange={(event) => setModelName(event.currentTarget.value)}
            disabled={disabled}
            required
          />
        </label>

        <label>
          <span>{apiKeyLabel}</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.currentTarget.value)}
            disabled={disabled}
            autoComplete="off"
          />
        </label>
      </div>

      {isEdit && <p className="field-help">留空则保留原密钥</p>}

      <div className="form-actions">
        <button type="submit" disabled={disabled}>
          {isEdit ? '保存更改' : '添加 Provider'}
        </button>
        {isEdit && (
          <button
            type="button"
            className="secondary-button"
            onClick={onCancelEdit}
            disabled={disabled}
          >
            取消编辑
          </button>
        )}
      </div>
    </form>
  )
}
