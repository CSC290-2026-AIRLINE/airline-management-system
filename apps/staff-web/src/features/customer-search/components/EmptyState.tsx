interface EmptyStateProps {
  query: string
  onClear: () => void
  variant: 'desktop' | 'mobile'
}

/** Shown when a search returns nothing. Wording is taken from the design frames. */
export function EmptyState({ query, onClear, variant }: EmptyStateProps) {
  return (
    <div className="cs-empty">
      <span className="cs-empty__badge" aria-hidden="true">
        0
      </span>
      <p className="cs-empty__title">{variant === 'desktop' ? `No one matches “${query}”` : 'No one matches'}</p>
      <p className="cs-empty__hint">
        {variant === 'desktop'
          ? 'Check the spelling, try the passport or Thai spelling, or search by date of birth or passport number.'
          : 'Try the passport or Thai spelling, a date of birth or passport number.'}
      </p>
      {variant === 'desktop' ? (
        <button type="button" className="cs-btn cs-btn--outline" onClick={onClear}>
          Clear search
        </button>
      ) : null}
    </div>
  )
}
