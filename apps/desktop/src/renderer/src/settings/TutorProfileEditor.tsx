import type { TutorProfileDto } from '@deepstorming/contracts'
import React from 'react'
import { useCallback, useState } from 'react'

import { UiIcon } from '../ui/UiIcon'
import { canLeaveSettings } from './settings-navigation'
import { SettingsPageHeader } from './SettingsPageHeader'
import { TutorProfileDetail } from './TutorProfileDetail'

type Props = Readonly<{
  tutors: readonly TutorProfileDto[]
  onChanged: (profile: TutorProfileDto) => void
  onDirtyChange?: (dirty: boolean) => void
}>

type TutorView =
  { kind: 'collection' } | { kind: 'create' } | { kind: 'edit'; tutor: TutorProfileDto }

const noopDirtyChange = (_dirty: boolean) => undefined

export const TutorProfileEditor = ({
  tutors,
  onChanged,
  onDirtyChange = noopDirtyChange,
}: Props): React.JSX.Element => {
  const [view, setView] = useState<TutorView>({ kind: 'collection' })
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')

  const reportDirty = useCallback(
    (nextDirty: boolean) => {
      setDirty(nextDirty)
      onDirtyChange(nextDirty)
    },
    [onDirtyChange],
  )

  const showCollection = useCallback(() => {
    reportDirty(false)
    setView({ kind: 'collection' })
  }, [reportDirty])

  const requestCollection = () => {
    if (!canLeaveSettings(dirty, window.confirm)) return
    showCollection()
  }

  const saved = (profile: TutorProfileDto) => {
    onChanged(profile)
    setMessage('导师档案已保存。')
    showCollection()
  }

  const archived = (profile: TutorProfileDto) => {
    onChanged(profile)
    setMessage('导师已停用。')
    showCollection()
  }

  if (view.kind !== 'collection') {
    return (
      <TutorProfileDetail
        mode={view.kind === 'edit' ? 'edit' : 'create'}
        {...(view.kind === 'edit' ? { tutor: view.tutor } : {})}
        onSaved={saved}
        onArchived={archived}
        onBack={requestCollection}
        onDirtyChange={reportDirty}
      />
    )
  }

  return (
    <section className="settings-detail-page tutor-collection-page">
      <SettingsPageHeader
        title="选择导师"
        description="选择一个导师进行设置，或创建新的导师 / 学习伙伴。"
        breadcrumb={['设置', '导师 / 伙伴']}
        action={
          <button
            type="button"
            onClick={() => {
              setMessage('')
              setView({ kind: 'create' })
            }}
          >
            新增导师
          </button>
        }
      />
      <div className="settings-detail-scroll tutor-profile-list" aria-label="导师档案列表">
        {message.length > 0 && <p role="status">{message}</p>}
        {tutors.map((profile) => (
          <button
            type="button"
            key={profile.id}
            className="tutor-profile-row"
            aria-label={`编辑 ${profile.name}`}
            onClick={() => {
              setMessage('')
              setView({ kind: 'edit', tutor: profile })
            }}
          >
            <span className="tutor-avatar-placeholder" aria-hidden="true">
              {profile.name.slice(0, 1)}
            </span>
            <span className="tutor-profile-row-copy">
              <strong>{profile.name}</strong>
              <span>{profile.expertiseTags.join(' · ') || '未设置领域'}</span>
            </span>
            <span className="status-label">
              {profile.status === 'active' ? '可使用' : '已停用'}
            </span>
            <UiIcon name="chevron-right" />
          </button>
        ))}
      </div>
    </section>
  )
}
