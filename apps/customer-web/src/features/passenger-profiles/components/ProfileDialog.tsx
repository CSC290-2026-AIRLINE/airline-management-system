import { useEffect, useId, useRef, type ReactNode } from 'react'

export default function ProfileDialog({
  title,
  onClose,
  children,
  kind = '',
  closeButton = false,
  steps,
  suspended = false,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  kind?: string
  closeButton?: boolean
  steps?: ReactNode
  suspended?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])
  useEffect(() => {
    if (suspended) ref.current?.close()
    else if (!ref.current?.open) ref.current?.showModal()
  }, [suspended])
  return (
    <dialog
      ref={ref}
      className={`profile-dialog ${kind}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
    >
      {steps}
      <header>
        <h2 id={titleId}>{title}</h2>
        {closeButton && (
          <button className="profile-link dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        )}
      </header>
      {children}
    </dialog>
  )
}
