import React, { useEffect, useState } from 'react'

export const MessageAvatar = ({
  name,
  assetId,
}: Readonly<{ name: string; assetId?: string | undefined }>): React.JSX.Element => {
  const [dataUrl, setDataUrl] = useState<string>()

  useEffect(() => {
    let active = true
    setDataUrl(undefined)
    if (assetId === undefined) return () => undefined
    void window.deepstorming.learningSettings.getAvatar(assetId).then((result) => {
      if (active && result.ok) setDataUrl(result.data.dataUrl)
    })
    return () => {
      active = false
    }
  }, [assetId])

  const label = `${name}头像`
  return dataUrl === undefined ? (
    <span className="lesson-message-avatar lesson-message-avatar-fallback" aria-label={label}>
      {name.trim().charAt(0) || '·'}
    </span>
  ) : (
    <img className="lesson-message-avatar" src={dataUrl} alt={label} />
  )
}
