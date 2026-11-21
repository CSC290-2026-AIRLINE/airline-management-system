import { useEffect, type ReactNode } from 'react'

/**
 * Holds the inspector below the `xl` breakpoint, where there is no room for it beside the
 * cards: a bottom sheet on a phone, a centred panel on a tablet.
 */
export function InspectorSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex items-end justify-center bg-primary/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pairing details"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-card-bg px-5 pt-3 pb-6 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:px-6 sm:pt-5"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border-desc sm:hidden" />
        {children}
      </div>
    </div>
  )
}
