import { useEffect, useRef, type ReactNode } from 'react'

export function WatchlistDialog({
  title,
  children,
  onClose,
  compact = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  compact?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    dialog.focus()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={`wl-dialog${compact ? ' wl-dialog-compact' : ''}`}
      tabIndex={-1}
      aria-labelledby="wl-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id="wl-dialog-title">{title}</h2>
      {children}
    </dialog>
  )
}
