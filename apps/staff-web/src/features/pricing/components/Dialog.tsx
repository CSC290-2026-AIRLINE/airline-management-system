import { useEffect, useRef, type ReactNode } from 'react'

interface DialogProps {
  labelledBy: string
  onClose: () => void
  children: ReactNode
}

// Native <dialog> opened as a modal: focus is trapped, Esc closes it and the page behind is inert.
// Styled as a bottom sheet on phones (pr-sheet in pricing.css). Mount it to open, unmount to close.
export function Dialog({ labelledBy, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="pr-sheet"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault() // let React unmount it instead of the browser closing it behind React's back
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose() // a click on the backdrop lands on the dialog itself
      }}
    >
      {children}
    </dialog>
  )
}
