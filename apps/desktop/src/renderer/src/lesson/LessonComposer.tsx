import React, { useState } from 'react'

type LessonComposerProps = Readonly<{
  value: string
  state:
    | Readonly<{ status: 'idle' }>
    | Readonly<{ status: 'submitting' }>
    | Readonly<{ status: 'success'; message: string }>
    | Readonly<{ status: 'error'; message: string }>
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}>

export const LessonComposer = ({
  value,
  state,
  onChange,
  onSubmit,
  onCancel,
}: LessonComposerProps): React.JSX.Element => {
  const [validationError, setValidationError] = useState<string | null>(null)
  const submitting = state.status === 'submitting'

  const submit = () => {
    if (value.trim().length === 0) {
      setValidationError('请输入回答。')
      return
    }
    setValidationError(null)
    onSubmit()
  }

  return (
    <form
      className="lesson-composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label htmlFor="lesson-composer-input">你的回答</label>
      <div className="lesson-composer-row">
        <textarea
          id="lesson-composer-input"
          value={value}
          rows={3}
          maxLength={1000}
          disabled={submitting}
          placeholder="输入回答；Enter 发送，Shift + Enter 换行"
          onChange={(event) => {
            setValidationError(null)
            onChange(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="lesson-composer-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? '发送中…' : '发送'}
          </button>
          {submitting && (
            <button type="button" className="secondary-button" onClick={onCancel}>
              取消生成
            </button>
          )}
        </div>
      </div>
      {validationError && (
        <p role="alert" className="error-state">
          {validationError}
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="error-state">
          {state.message}
        </p>
      )}
      {state.status === 'success' && (
        <p role="status" className="success-state">
          {state.message}
        </p>
      )}
    </form>
  )
}
