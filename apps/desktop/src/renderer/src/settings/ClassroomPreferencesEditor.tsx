import type { ClassroomPreferencesDto, TutorProfileDto } from '@deepstorming/contracts'
import React, { useEffect, useState } from 'react'

type Props = Readonly<{
  preferences: ClassroomPreferencesDto
  tutors: readonly TutorProfileDto[]
  onSaved: (preferences: ClassroomPreferencesDto) => void
}>

export const ClassroomPreferencesEditor = ({
  preferences,
  tutors,
  onSaved,
}: Props): React.JSX.Element => {
  const [draft, setDraft] = useState(preferences)
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => setDraft(preferences), [preferences])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setState('saving')
    const result = await window.deepstorming.learningSettings.saveClassroomPreferences(draft)
    if (!result.ok) {
      setState('error')
      setMessage(result.error.message)
      return
    }
    setState('success')
    setMessage('课堂设置已保存。')
    onSaved(result.data)
  }

  const activeTutors = tutors.filter((tutor) => tutor.status === 'active')
  const tutorOptions = (selected: string | null) => (
    <>
      <option value="">不指定</option>
      {activeTutors.map((tutor) => (
        <option key={tutor.id} value={tutor.id}>
          {tutor.name}
          {selected === tutor.id ? '（当前）' : ''}
        </option>
      ))}
    </>
  )

  return (
    <section className="settings-panel" aria-labelledby="classroom-settings-title">
      <h1 id="classroom-settings-title">课堂设置</h1>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label>
          <span>书籍默认导师</span>
          <select
            value={draft.defaultBookTutorId ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, defaultBookTutorId: event.target.value || null })
            }
          >
            {tutorOptions(draft.defaultBookTutorId)}
          </select>
        </label>
        <label>
          <span>论文默认导师</span>
          <select
            value={draft.defaultPaperTutorId ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, defaultPaperTutorId: event.target.value || null })
            }
          >
            {tutorOptions(draft.defaultPaperTutorId)}
          </select>
        </label>
        <label>
          <span>默认课堂节奏</span>
          <select
            value={draft.defaultPace}
            onChange={(event) =>
              setDraft({
                ...draft,
                defaultPace: event.target.value as ClassroomPreferencesDto['defaultPace'],
              })
            }
          >
            <option value="slow">慢</option>
            <option value="standard">标准</option>
            <option value="fast">快</option>
          </select>
        </label>
        <label>
          <span>剩余上下文压缩阈值（%）</span>
          <input
            type="number"
            min={10}
            max={50}
            value={draft.contextCompressionRemainingPercent}
            onChange={(event) =>
              setDraft({
                ...draft,
                contextCompressionRemainingPercent: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          <span>最近原文保留轮数</span>
          <input
            type="number"
            min={1}
            max={50}
            value={draft.recentTurnCount}
            onChange={(event) =>
              setDraft({ ...draft, recentTurnCount: Number(event.target.value) })
            }
          />
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={draft.autoScroll}
            onChange={(event) => setDraft({ ...draft, autoScroll: event.target.checked })}
          />
          <span>自动滚动到新消息</span>
        </label>
        <button type="submit" disabled={state === 'saving'}>
          {state === 'saving' ? '正在保存…' : '保存课堂设置'}
        </button>
      </form>
      {message.length > 0 && (
        <p role={state === 'error' ? 'alert' : 'status'} className="settings-feedback">
          {message}
        </p>
      )}
    </section>
  )
}
