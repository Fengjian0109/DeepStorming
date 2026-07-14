import type { TutorProfileDraftDto, TutorProfileDto } from '@deepstorming/contracts'
import React, { useState } from 'react'

type Props = Readonly<{
  tutors: readonly TutorProfileDto[]
  onChanged: (profile: TutorProfileDto) => void
}>

const EMPTY_DRAFT: TutorProfileDraftDto = {
  name: '',
  personality: '耐心、好奇',
  tone: '清晰、温和',
  expertiseTags: [],
  strictness: 3,
  socraticIntensity: 4,
  guidanceStyle: 'question_first',
  bookStrategy: '先确认理解，再通过追问、提示和短讲解逐步推进。',
  paperStrategy: '围绕问题、贡献、方法、证据与局限推进阅读。',
  customInstructions: '',
}

export const TutorProfileEditor = ({ tutors, onChanged }: Props): React.JSX.Element => {
  const [editing, setEditing] = useState<TutorProfileDto>()
  const [draft, setDraft] = useState<TutorProfileDraftDto>(EMPTY_DRAFT)
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const edit = (profile: TutorProfileDto) => {
    setEditing(profile)
    setDraft({
      name: profile.name,
      ...(profile.avatarAssetId === undefined ? {} : { avatarAssetId: profile.avatarAssetId }),
      personality: profile.personality,
      tone: profile.tone,
      expertiseTags: profile.expertiseTags,
      strictness: profile.strictness,
      socraticIntensity: profile.socraticIntensity,
      guidanceStyle: profile.guidanceStyle,
      bookStrategy: profile.bookStrategy,
      paperStrategy: profile.paperStrategy,
      customInstructions: profile.customInstructions,
    })
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setState('saving')
    const result =
      editing === undefined
        ? await window.deepstorming.learningSettings.createTutor(draft)
        : await window.deepstorming.learningSettings.updateTutor(
            editing.id,
            editing.revision,
            draft,
          )
    if (!result.ok) {
      setState('error')
      setMessage(result.error.message)
      return
    }
    onChanged(result.data)
    setEditing(result.data)
    setState('idle')
    setMessage('导师档案已保存。')
  }

  const archive = async (profile: TutorProfileDto) => {
    setState('saving')
    const result = await window.deepstorming.learningSettings.archiveTutor(
      profile.id,
      profile.revision,
    )
    if (!result.ok) {
      setState('error')
      setMessage(result.error.message)
      return
    }
    onChanged(result.data)
    setState('idle')
  }

  return (
    <section className="settings-panel" aria-labelledby="tutor-settings-title">
      <div className="settings-title-row">
        <div>
          <h1 id="tutor-settings-title">导师 / 伙伴</h1>
          <p>配置性格、擅长领域与教学策略；历史课堂保留创建时的快照。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(undefined)
            setDraft(EMPTY_DRAFT)
          }}
        >
          新建导师
        </button>
      </div>
      <div className="tutor-profile-grid">
        <div className="tutor-profile-list" aria-label="导师档案列表">
          {tutors.map((profile) => (
            <article key={profile.id} className="tutor-profile-card">
              <strong>{profile.name}</strong>
              <span>{profile.expertiseTags.join(' · ') || '未设置领域'}</span>
              <div className="inline-actions">
                <button type="button" onClick={() => edit(profile)}>
                  编辑
                </button>
                {profile.status === 'active' && (
                  <button type="button" onClick={() => void archive(profile)}>
                    停用
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <label>
            <span>名称</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>性格</span>
            <textarea
              value={draft.personality}
              onChange={(event) => setDraft({ ...draft, personality: event.target.value })}
            />
          </label>
          <label>
            <span>表达语气</span>
            <input
              value={draft.tone}
              onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
            />
          </label>
          <label>
            <span>擅长领域（逗号分隔）</span>
            <input
              value={draft.expertiseTags.join(', ')}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expertiseTags: event.target.value
                    .split(/[,，]/u)
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            <span>苏格拉底追问强度</span>
            <input
              type="range"
              min={1}
              max={5}
              value={draft.socraticIntensity}
              onChange={(event) =>
                setDraft({ ...draft, socraticIntensity: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>书籍教学策略</span>
            <textarea
              value={draft.bookStrategy}
              onChange={(event) => setDraft({ ...draft, bookStrategy: event.target.value })}
            />
          </label>
          <label>
            <span>论文教学策略</span>
            <textarea
              value={draft.paperStrategy}
              onChange={(event) => setDraft({ ...draft, paperStrategy: event.target.value })}
            />
          </label>
          <label>
            <span>自定义要求</span>
            <textarea
              value={draft.customInstructions}
              onChange={(event) => setDraft({ ...draft, customInstructions: event.target.value })}
            />
          </label>
          <button type="submit" disabled={state === 'saving' || draft.name.trim().length === 0}>
            {state === 'saving' ? '正在保存…' : editing === undefined ? '创建导师' : '保存导师'}
          </button>
        </form>
      </div>
      {message.length > 0 && <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>}
    </section>
  )
}
