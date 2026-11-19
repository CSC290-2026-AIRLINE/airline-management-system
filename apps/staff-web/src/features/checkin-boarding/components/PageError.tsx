import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Message } from './pills.tsx'
import { SECONDARY_BUTTON } from './styles.ts'

/** Shown in place of a check-in page that failed to render; the sidebar stays, so the agent can move on. */
export function PageError({ reset }: ErrorComponentProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Message tone="error" role="alert">
        This page stopped working. Try again, or reload the page if it keeps happening.
      </Message>
      <Button type="button" variant="outline" className={SECONDARY_BUTTON} onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
