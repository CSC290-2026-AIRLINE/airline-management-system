import { Button } from '@staff-web/components/ui/button'

interface EmptyStateProps {
  query: string
  onClear: () => void
  variant: 'desktop' | 'mobile'
}

/** Shown when a search returns nothing. Wording is taken from the design frames. */
export function EmptyState({ query, onClear, variant }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span
        className="flex size-10 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground"
        aria-hidden="true"
      >
        0
      </span>
      <p className="font-semibold">{variant === 'desktop' ? `No one matches “${query}”` : 'No one matches'}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {variant === 'desktop'
          ? 'Check the spelling, try the passport or Thai spelling, or search by date of birth or passport number.'
          : 'Try the passport or Thai spelling, a date of birth or passport number.'}
      </p>
      {variant === 'desktop' ? (
        <Button type="button" variant="outline" onClick={onClear}>
          Clear search
        </Button>
      ) : null}
    </div>
  )
}
