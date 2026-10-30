import type { ReactNode } from 'react'

export function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <div className="f9-state" role="status">
      {children}
    </div>
  )
}

export function EmptyMessage({ children }: { children: ReactNode }) {
  return <div className="f9-state">{children}</div>
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="f9-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
