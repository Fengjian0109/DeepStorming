import React from 'react'

import { useAppearance } from '../appearance/AppearanceProvider'
import type { AppearancePreference } from '../appearance/appearance'

const options: ReadonlyArray<Readonly<{ value: AppearancePreference; label: string }>> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export const AppearanceEditor = () => {
  const { preference, setPreference } = useAppearance()

  return (
    <section className="settings-section appearance-editor">
      <h1>外观</h1>
      <p>选择界面主题。跟随系统会响应 macOS 外观变化。</p>
      <fieldset className="appearance-options">
        <legend>外观主题</legend>
        {options.map((option) => (
          <label key={option.value} className="appearance-option">
            <input
              type="radio"
              name="appearance"
              value={option.value}
              checked={preference === option.value}
              onChange={() => setPreference(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
