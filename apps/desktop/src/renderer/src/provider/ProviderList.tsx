import type { ProviderProfileDto, ProviderTypeDto } from '@deepstorming/contracts'
import React from 'react'

type ProviderListProps = Readonly<{
  providers: readonly ProviderProfileDto[]
  disabled?: boolean | undefined
  testingProviderId?: string | undefined
  busyProviderId?: string | undefined
  onEdit: (provider: ProviderProfileDto) => void
  onActivate: (provider: ProviderProfileDto) => void
  onTest: (provider: ProviderProfileDto) => void
  onDelete: (provider: ProviderProfileDto) => void
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
  testingProviderId,
  busyProviderId,
  onEdit,
  onActivate,
  onTest,
  onDelete,
}: ProviderListProps): React.JSX.Element => (
  <section className="provider-list" aria-label="Provider 列表">
    {providers.map((provider) => {
      const isBusy = disabled || busyProviderId === provider.id
      const isTesting = testingProviderId === provider.id
      return (
        <article className="provider-card" key={provider.id}>
          <div className="provider-card-header">
            <div>
              <h3>{provider.displayName}</h3>
              <p>
                {providerTypeText[provider.providerType]} · {provider.modelName}
              </p>
            </div>
            <div className="provider-badges">
              {provider.isActive && <span className="status-label">启用中</span>}
              <span className="status-label">
                {provider.hasApiKey ? '已保存密钥' : '未保存密钥'}
              </span>
              {provider.lastTestStatus && (
                <span className="status-label">{testStatusText[provider.lastTestStatus]}</span>
              )}
            </div>
          </div>

          {provider.baseUrl && <p className="provider-base-url">{provider.baseUrl}</p>}

          <dl className="capability-list" aria-label={`${provider.displayName} 能力`}>
            <div>
              <dt>流式</dt>
              <dd>{provider.capabilities.streaming ? '支持' : '不支持'}</dd>
            </div>
            <div>
              <dt>结构化输出</dt>
              <dd>{provider.capabilities.structuredOutput ? '支持' : '不支持'}</dd>
            </div>
            <div>
              <dt>视觉</dt>
              <dd>{provider.capabilities.vision ? '支持' : '不支持'}</dd>
            </div>
          </dl>

          <div className="card-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onEdit(provider)}
              disabled={isBusy || isTesting}
              aria-label={`编辑 ${provider.displayName}`}
            >
              编辑
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onTest(provider)}
              disabled={isBusy || isTesting}
              aria-label={`测试 ${provider.displayName}`}
            >
              测试
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onActivate(provider)}
              disabled={isBusy || isTesting || provider.isActive}
              aria-label={`设为启用 ${provider.displayName}`}
            >
              设为启用
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => onDelete(provider)}
              disabled={isBusy || isTesting}
              aria-label={`删除 ${provider.displayName}`}
            >
              删除
            </button>
          </div>
        </article>
      )
    })}
  </section>
)
