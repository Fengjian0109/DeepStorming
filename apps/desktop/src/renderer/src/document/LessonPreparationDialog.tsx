import type { LearningSettingsDto } from '@deepstorming/contracts'
import React, { useEffect, useMemo, useState } from 'react'

type LessonPace = LearningSettingsDto['classroomPreferences']['defaultPace']

export const LessonPreparationDialog = ({
  open,
  settings,
  documentType,
  busy,
  onClose,
  onStart,
}: Readonly<{
  open: boolean
  settings: LearningSettingsDto | null
  documentType: 'generic' | 'textbook' | 'paper'
  busy: boolean
  onClose: () => void
  onStart: (selection: Readonly<{ tutorProfileId: string; pace: LessonPace }>) => void
}>): React.JSX.Element | null => {
  const activeTutors = useMemo(
    () => settings?.tutorProfiles.filter((profile) => profile.status === 'active') ?? [],
    [settings],
  )
  const preferredTutorId =
    documentType === 'paper'
      ? settings?.classroomPreferences.defaultPaperTutorId
      : settings?.classroomPreferences.defaultBookTutorId
  const [tutorProfileId, setTutorProfileId] = useState('')
  const [pace, setPace] = useState<LessonPace>('standard')

  useEffect(() => {
    if (!open || settings === null) return
    const preferred = activeTutors.find((profile) => profile.id === preferredTutorId)
    setTutorProfileId(preferred?.id ?? activeTutors[0]?.id ?? '')
    setPace(settings.classroomPreferences.defaultPace)
  }, [activeTutors, open, preferredTutorId, settings])

  if (!open) return null

  return (
    <div className="modal-backdrop">
      <section role="dialog" aria-modal="true" aria-label="课堂准备" className="confirm-dialog">
        <h2>课堂准备</h2>
        {settings === null ? (
          <p role="status">正在读取导师与课堂设置…</p>
        ) : (
          <>
            <label>
              导师
              <select
                aria-label="选择课堂导师"
                value={tutorProfileId}
                disabled={busy}
                onChange={(event) => setTutorProfileId(event.target.value)}
              >
                {activeTutors.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · {profile.expertiseTags.join('、') || '通识学习'}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>课堂节奏</legend>
              {(
                [
                  ['slow', '慢：一步一确认'],
                  ['standard', '标准：追问与讲解平衡'],
                  ['fast', '快：理解后快速推进'],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="lesson-pace"
                    value={value}
                    checked={pace === value}
                    disabled={busy}
                    onChange={() => setPace(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {activeTutors.length === 0 && <p role="alert">没有可用导师，请先在设置中创建导师。</p>}
          </>
        )}
        <div className="form-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy || settings === null || tutorProfileId.length === 0}
            onClick={() => onStart({ tutorProfileId, pace })}
          >
            {busy ? '正在开课…' : '进入课堂'}
          </button>
        </div>
      </section>
    </div>
  )
}
