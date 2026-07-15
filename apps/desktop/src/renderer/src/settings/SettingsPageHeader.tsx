import React from 'react'

import { IconButton } from '../ui/IconButton'

export const SettingsPageHeader = ({
  title,
  description,
  breadcrumb,
  onBack,
  action,
}: Readonly<{
  title: string
  description?: string
  breadcrumb: readonly string[]
  onBack?: () => void
  action?: React.ReactNode
}>) => (
  <header className="settings-page-header">
    <div className="settings-page-heading-row">
      {onBack && <IconButton icon="arrow-left" label="返回" onClick={onBack} />}
      <div className="settings-page-heading-copy">
        <nav aria-label="设置路径" className="settings-breadcrumb">
          {breadcrumb.join(' / ')}
        </nav>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="settings-page-action">{action}</div>}
    </div>
  </header>
)
