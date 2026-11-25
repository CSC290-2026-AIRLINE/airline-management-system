import type { ErrorComponentProps } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'

/** Shown in place of a page that failed to render, so the sidebar stays usable and the other pages still open. */
export function PageError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex w-full max-w-6xl flex-col px-6 pt-6 min-[1100px]:px-[63px]">
      <Alert variant="destructive">
        <AlertTitle>This page could not be shown</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{error instanceof Error ? error.message : 'Something went wrong.'}</span>
          <Button size="sm" variant="outline" onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
