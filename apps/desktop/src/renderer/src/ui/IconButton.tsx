import React from 'react'

import { UiIcon, type UiIconName } from './UiIcon'

export const IconButton = ({
  icon,
  label,
  className = '',
  ...button
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: UiIconName; label: string }) => (
  <button
    {...button}
    type="button"
    className={`icon-button ${className}`.trim()}
    aria-label={label}
    title={label}
  >
    <UiIcon name={icon} />
  </button>
)
