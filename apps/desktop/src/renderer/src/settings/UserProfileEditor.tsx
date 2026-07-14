import type { UserProfileDto } from '@deepstorming/contracts'
import React, { useEffect, useState } from 'react'

type Props = Readonly<{
  profile: UserProfileDto
  onSaved: (profile: UserProfileDto) => void
}>

export const UserProfileEditor = ({ profile, onSaved }: Props): React.JSX.Element => {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [avatarAssetId, setAvatarAssetId] = useState(profile.avatarAssetId)
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDisplayName(profile.displayName)
    setAvatarAssetId(profile.avatarAssetId)
  }, [profile])

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
        <label>
          <span>你的头像</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => void importAvatar(event.currentTarget.files?.[0])}
          />
        </label>
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
