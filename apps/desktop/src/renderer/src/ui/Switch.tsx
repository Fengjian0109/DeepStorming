import React from 'react'

export const Switch = ({
  label,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) => (
  <label className="switch-field">
    <span>{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch-control"
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  </label>
)
