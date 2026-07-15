import type { LearningSettingsDto, TutorProfileDto } from '@deepstorming/contracts'
import React, { useEffect, useState } from 'react'

import { WorkspaceContextual } from '../app/WorkspaceShell'
import { ProviderManager } from '../provider/ProviderManager'
import { UiIcon, type UiIconName } from '../ui/UiIcon'
import { AppearanceEditor } from './AppearanceEditor'
import { ClassroomPreferencesEditor } from './ClassroomPreferencesEditor'
import { canLeaveSettings } from './settings-navigation'
import { TutorProfileEditor } from './TutorProfileEditor'
import { UserProfileEditor } from './UserProfileEditor'

type Section = 'provider' | 'tutors' | 'profile' | 'classroom' | 'appearance'

const sections: readonly Readonly<{ id: Section; label: string; icon: UiIconName }>[] = [
  { id: 'provider', label: 'AI Provider', icon: 'provider' },
  { id: 'tutors', label: '导师 / 伙伴', icon: 'tutor' },
  { id: 'profile', label: '个人资料', icon: 'user' },
  { id: 'classroom', label: '课堂设置', icon: 'lessons' },
  { id: 'appearance', label: '外观', icon: 'appearance' },
]

export const SettingsCenter = (): React.JSX.Element => {
  const [section, setSection] = useState<Section>('provider')
  const [settings, setSettings] = useState<LearningSettingsDto>()
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let active = true
    void window.deepstorming.learningSettings.get().then((result) => {
      if (!active) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setSettings(result.data)
    })
    return () => {
      active = false
    }
  }, [])

  const replaceTutor = (profile: TutorProfileDto) => {
    setSettings((current) =>
      current === undefined
        ? current
        : {
            ...current,
            tutorProfiles: current.tutorProfiles.some((item) => item.id === profile.id)
              ? current.tutorProfiles.map((item) => (item.id === profile.id ? profile : item))
              : [...current.tutorProfiles, profile],
          },
    )
  }

  const requestSection = (next: Section) => {
    if (next === section) return
    if (!canLeaveSettings(dirty, window.confirm)) return
    setDirty(false)
    setSection(next)
  }

  return (
    <>
      <WorkspaceContextual>
        <nav aria-label="设置分类" className="settings-contextual-navigation">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => requestSection(item.id)}
            >
              <UiIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </WorkspaceContextual>
      {error.length > 0 && (
        <section className="settings-panel">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </section>
      )}
      {error.length === 0 && settings === undefined && (
        <p className="muted-state">正在加载学习设置…</p>
      )}
      {error.length === 0 && settings !== undefined && section === 'provider' && (
        <ProviderManager onDirtyChange={setDirty} />
      )}
      {settings !== undefined && section === 'tutors' && (
        <TutorProfileEditor
          tutors={settings.tutorProfiles}
          onChanged={replaceTutor}
          onDirtyChange={setDirty}
        />
      )}
      {settings !== undefined && section === 'profile' && (
        <UserProfileEditor
          profile={settings.userProfile}
          onSaved={(userProfile) => setSettings({ ...settings, userProfile })}
          onDirtyChange={setDirty}
        />
      )}
      {settings !== undefined && section === 'classroom' && (
        <ClassroomPreferencesEditor
          preferences={settings.classroomPreferences}
          tutors={settings.tutorProfiles}
          onSaved={(classroomPreferences) => setSettings({ ...settings, classroomPreferences })}
          onDirtyChange={setDirty}
        />
      )}
      {section === 'appearance' && <AppearanceEditor />}
    </>
  )
}
