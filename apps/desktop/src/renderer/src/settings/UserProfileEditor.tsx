import type { UserProfileDto } from '@deepstorming/contracts'
import React, { useEffect, useState } from 'react'

import { FilePickerButton } from '../ui/FilePickerButton'

type Props = Readonly<{
  profile: UserProfileDto
  onSaved: (profile: UserProfileDto) => void
  onDirtyChange?: (dirty: boolean) => void
}>

const noopDirtyChange = (_dirty: boolean) => undefined

export const UserProfileEditor = ({
  profile,
  onSaved,
  onDirtyChange = noopDirtyChange,
}: Props): React.JSX.Element => {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [avatarAssetId, setAvatarAssetId] = useState(profile.avatarAssetId)
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDisplayName(profile.displayName)
    setAvatarAssetId(profile.avatarAssetId)
    onDirtyChange(false)
  }, [onDirtyChange, profile])

  useEffect(() => {
    onDirtyChange(displayName !== profile.displayName || avatarAssetId !== profile.avatarAssetId)
  }, [avatarAssetId, displayName, onDirtyChange, profile])

  const importAvatar = async (file: File | undefined) => {
    if (file === undefined) return
    setStatus('saving')
    const result = await window.deepstorming.learningSettings.importAvatar(file)
    if (!result.ok) {
      setStatus('error')
      setMessage(result.error.message)
      return
    }
    setAvatarAssetId(result.data.assetId)
    setStatus('idle')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('saving')
    const result = await window.deepstorming.learningSettings.saveUserProfile(profile.revision, {
      displayName,
      ...(avatarAssetId === undefined ? {} : { avatarAssetId }),
    })
    if (!result.ok) {
      setStatus('error')
      setMessage(result.error.message)
      return
    }
    setStatus('success')
    setMessage('个人资料已保存。')
    onDirtyChange(false)
    onSaved(result.data)
  }

  return (
    <section className="settings-panel" aria-labelledby="user-profile-title">
      <h1 id="user-profile-title">个人资料</h1>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label>
          <span>你的名称</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <div className="settings-field-group">
          <span className="settings-field-label">你的头像</span>
          <FilePickerButton
            label="选择个人头像"
            accept="image/png,image/jpeg,image/webp"
            disabled={status === 'saving'}
            onFile={(file) => void importAvatar(file)}
          />
        </div>
        {avatarAssetId !== undefined && <p className="field-help">头像已导入并安全保存。</p>}
        <button type="submit" disabled={status === 'saving' || displayName.trim().length === 0}>
          {status === 'saving' ? '正在保存…' : '保存个人资料'}
        </button>
      </form>
      {message.length > 0 && (
        <p role={status === 'error' ? 'alert' : 'status'} className="settings-feedback">
          {message}
        </p>
      )}
    </section>
  )
}
