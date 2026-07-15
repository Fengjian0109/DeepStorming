import React, { useEffect, useRef } from 'react'

import { UiIcon } from '../ui/UiIcon'

import { DocumentForm } from './DocumentForm'

type DocumentCreateDialogProps = Readonly<{
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: React.ComponentProps<typeof DocumentForm>['onSubmit']
  onError: (message: string) => void
}>

export const DocumentCreateDialog = ({
  open,
  saving,
  onClose,
  onSubmit,
  onError,
}: DocumentCreateDialogProps): React.JSX.Element | null => {
  const savingRef = useRef(saving)
  const onCloseRef = useRef(onClose)
  savingRef.current = saving
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || savingRef.current) return
      event.preventDefault()
      onCloseRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  const submitAndClose = async (
    draft: Parameters<React.ComponentProps<typeof DocumentForm>['onSubmit']>[0],
  ): Promise<boolean> => {
    const saved = await onSubmit(draft)
    if (saved) onClose()
    return saved
  }

  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-create-dialog-title"
        className="document-create-dialog"
      >
        <div className="panel-header">
          <h2 id="document-create-dialog-title">添加文本资料</h2>
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>
            <UiIcon name="x" />
            取消
          </button>
        </div>
        <DocumentForm disabled={saving} onSubmit={submitAndClose} onError={onError} />
      </section>
    </div>
  )
}
