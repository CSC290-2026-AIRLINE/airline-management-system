import type { ReactNode } from 'react'

interface ListStateProps {
  loading: boolean
  error: string | null
  empty: boolean
  noun: string // "flights", "airports": used in the loading and error lines
  emptyText: string
  children?: ReactNode // an action under the empty message, such as "Clear filters"
}

// The loading, error and empty lines every list page needs; renders nothing once there are rows.
export function ListState({ loading, error, empty, noun, emptyText, children }: ListStateProps) {
  if (error)
    return (
      <p role="alert">
        Could not load {noun}: {error}
      </p>
    )
  if (loading) return <p>Loading {noun}…</p>
  if (empty)
    return (
      <div className="fs-empty">
        <p>{emptyText}</p>
        {children}
      </div>
    )
  return null
}
