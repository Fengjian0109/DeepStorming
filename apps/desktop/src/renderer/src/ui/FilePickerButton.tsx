import React, { useRef, useState } from 'react'

import { UiIcon } from './UiIcon'

export const FilePickerButton = ({
  label,
  accept,
  disabled = false,
  onFile,
}: {
  label: string
  accept: string
  disabled?: boolean
  onFile: (file: File) => void
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('尚未选择')

  return (
    <div className="file-picker-control">
      <input
        ref={inputRef}
        className="visually-hidden-file-input"
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={`${label} 文件输入`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          setFilename(file.name)
          onFile(file)
        }}
      />
      <button
        type="button"
        className="file-picker-trigger"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UiIcon name="folder" />
        <span>{label}</span>
      </button>
      <span className="file-picker-name" title={filename}>
        {filename}
      </span>
    </div>
  )
}
