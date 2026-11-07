import { Message } from './pills.tsx'

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null
  return (
    <Message tone="error">
      <span className="flex items-start justify-between gap-3">
        <span>{message}</span>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label="Dismiss the message" className="shrink-0 text-xl leading-none">
            ×
          </button>
        ) : null}
      </span>
    </Message>
  )
}
