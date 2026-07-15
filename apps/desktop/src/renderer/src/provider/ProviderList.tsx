import type { ProviderProfileDto, ProviderTypeDto } from '@deepstorming/contracts'
import React from 'react'

import { UiIcon } from '../ui/UiIcon'

type ProviderListProps = Readonly<{
  providers: readonly ProviderProfileDto[]
  disabled?: boolean | undefined
  onOpen: (provider: ProviderProfileDto) => void
}>

const providerTypeText: Record<ProviderTypeDto, string> = {
  mock: 'Mock',
  deepseek: 'DeepSeek',
  openai_compatible: 'OpenAI Compatible',
}

const testStatusText = {
  testing: '测试中',
  success: '测试成功',
  error: '测试失败',
  cancelled: '测试已取消',
} as const

export const ProviderList = ({
  providers,
  disabled = false,
  onOpen,
}: ProviderListProps): React.JSX.Element => (
  <section className="provider-list" aria-label="Provider 列表">
    {providers.map((provider) => (
      <button
        type="button"
        className="provider-row"
        key={provider.id}
        disabled={disabled}
        onClick={() => onOpen(provider)}
        aria-label={`打开 ${provider.displayName}`}
      >
        <span className="provider-row-copy">
          <strong>{provider.displayName}</strong>
          <span>
            {providerTypeText[provider.providerType]} · {provider.modelName}
          </span>
        </span>
        <span className="provider-badges" aria-label={`${provider.displayName} 状态`}>
          {provider.isActive && <span className="status-label">启用中</span>}
          <span className="status-label">{provider.hasApiKey ? '已保存密钥' : '未保存密钥'}</span>
          {provider.lastTestStatus && (
            <span className="status-label">{testStatusText[provider.lastTestStatus]}</span>
          )}
        </span>
        <UiIcon name="chevron-right" />
      </button>
    ))}
  </section>
)
