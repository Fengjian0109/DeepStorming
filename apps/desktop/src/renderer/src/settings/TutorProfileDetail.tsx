import type { TutorProfileDraftDto, TutorProfileDto } from '@deepstorming/contracts'
import React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { FilePickerButton } from '../ui/FilePickerButton'
import { SettingsPageHeader } from './SettingsPageHeader'

type Props = Readonly<{
  mode: 'create' | 'edit'
  tutor?: TutorProfileDto
  onSaved: (profile: TutorProfileDto) => void
  onArchived: (profile: TutorProfileDto) => void
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}>

const createEmptyDraft = (): TutorProfileDraftDto => ({
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
})

const draftFromTutor = (tutor: TutorProfileDto): TutorProfileDraftDto => ({
  name: tutor.name,
  ...(tutor.avatarAssetId === undefined ? {} : { avatarAssetId: tutor.avatarAssetId }),
  personality: tutor.personality,
  tone: tutor.tone,
  expertiseTags: [...tutor.expertiseTags],
  strictness: tutor.strictness,
  socraticIntensity: tutor.socraticIntensity,
  guidanceStyle: tutor.guidanceStyle,
  bookStrategy: tutor.bookStrategy,
  paperStrategy: tutor.paperStrategy,
  customInstructions: tutor.customInstructions,
})

export const TutorProfileDetail = ({
  mode,
  tutor,
  onSaved,
  onArchived,
  onBack,
  onDirtyChange,
}: Props): React.JSX.Element => {
  const initialDraft = useMemo(
    () => (mode === 'edit' && tutor ? draftFromTutor(tutor) : createEmptyDraft()),
    [mode, tutor],
  )
  const [draft, setDraft] = useState<TutorProfileDraftDto>(initialDraft)
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setDraft(initialDraft)
    setState('idle')
    setMessage('')
    onDirtyChange(false)
  }, [initialDraft, onDirtyChange])

  useEffect(() => {
    onDirtyChange(JSON.stringify(draft) !== JSON.stringify(initialDraft))
  }, [draft, initialDraft, onDirtyChange])

  const importAvatar = async (file: File) => {
    setState('saving')
    setMessage('')
    const result = await window.deepstorming.learningSettings.importAvatar(file)
    if (!result.ok) {
      setState('error')
      setMessage(result.error.message)
      return
    }
    setDraft((current) => ({ ...current, avatarAssetId: result.data.assetId }))
    setState('idle')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setState('saving')
    setMessage('')
    const result =
      mode === 'edit' && tutor
        ? await window.deepstorming.learningSettings.updateTutor(tutor.id, tutor.revision, draft)
        : await window.deepstorming.learningSettings.createTutor(draft)
    if (!result.ok) {
      setState('error')
      setMessage(result.error.message)
      return
    }
    onDirtyChange(false)
    onSaved(result.data)
  }

  const archive = async () => {
    if (!tutor) return
    setState('saving')
    setMessage('')
    const result = await window.deepstorming.learningSettings.archiveTutor(tutor.id, tutor.revision)
    if (!result.ok) {
      setState('error')
      setMessage(result.error.message)
      return
    }
    onDirtyChange(false)
    onArchived(result.data)
  }

  const disabled = state === 'saving'

  return (
    <section className="settings-detail-page">
      <SettingsPageHeader
        title={mode === 'edit' ? '编辑导师' : '新增导师'}
        description="配置人格、擅长领域和教学策略。历史课堂会继续使用创建时的快照。"
        breadcrumb={['设置', '导师 / 伙伴', mode === 'edit' && tutor ? tutor.name : '新增']}
        onBack={onBack}
      />
      <div className="settings-detail-scroll" data-testid="settings-detail-scroll">
        <form className="settings-form form-grid" onSubmit={(event) => void save(event)}>
          <label>
            <span>名称</span>
            <input
              value={draft.name}
              disabled={disabled}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              required
            />
          </label>

          <div className="settings-field-group">
            <span className="settings-field-label">导师头像</span>
            <FilePickerButton
              label="选择导师头像"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              onFile={(file) => void importAvatar(file)}
            />
            {draft.avatarAssetId !== undefined && (
              <p className="field-help">导师头像已导入并安全保存。</p>
            )}
          </div>

          <label>
            <span>性格</span>
            <textarea
              value={draft.personality}
              disabled={disabled}
              onChange={(event) => setDraft({ ...draft, personality: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>表达语气</span>
            <input
              value={draft.tone}
              disabled={disabled}
              onChange={(event) => setDraft({ ...draft, tone: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>擅长领域（逗号分隔）</span>
            <input
              value={draft.expertiseTags.join(', ')}
              disabled={disabled}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expertiseTags: event.currentTarget.value
                    .split(/[,，]/u)
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            <span>严格程度</span>
            <input
              type="range"
              min={1}
              max={5}
              value={draft.strictness}
              disabled={disabled}
              onChange={(event) =>
                setDraft({ ...draft, strictness: Number(event.currentTarget.value) })
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
              disabled={disabled}
              onChange={(event) =>
                setDraft({ ...draft, socraticIntensity: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            <span>引导方式</span>
            <select
              value={draft.guidanceStyle}
              disabled={disabled}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  guidanceStyle: event.currentTarget.value as TutorProfileDraftDto['guidanceStyle'],
                })
              }
            >
              <option value="question_first">优先提问</option>
              <option value="balanced">平衡引导</option>
              <option value="explain_first">优先讲解</option>
            </select>
          </label>
          <label>
            <span>书籍教学策略</span>
            <textarea
              value={draft.bookStrategy}
              disabled={disabled}
              onChange={(event) => setDraft({ ...draft, bookStrategy: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>论文教学策略</span>
            <textarea
              value={draft.paperStrategy}
              disabled={disabled}
              onChange={(event) => setDraft({ ...draft, paperStrategy: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>自定义要求</span>
            <textarea
              value={draft.customInstructions}
              disabled={disabled}
              onChange={(event) =>
                setDraft({ ...draft, customInstructions: event.currentTarget.value })
              }
            />
          </label>

          {message.length > 0 && <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>}
          <div className="settings-action-bar">
            <button type="submit" disabled={disabled || draft.name.trim().length === 0}>
              {disabled ? '正在保存…' : mode === 'edit' ? '保存导师' : '创建导师'}
            </button>
            {mode === 'edit' && tutor?.status === 'active' && (
              <button
                type="button"
                className="danger-button"
                disabled={disabled}
                onClick={() => void archive()}
              >
                停用导师
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
