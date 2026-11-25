import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@customer-web/components/ui/button'
import { Message } from './Message.tsx'
import styles from './flow.module.css'

/** Shown in place of the check-in flow when it fails to render, so the rest of the site keeps working. */
export function FlowCrash({ reset }: ErrorComponentProps) {
  return (
    <div className={styles.flow}>
      <Message tone="error" title="Something went wrong">
        Online check-in stopped working. Try again, or reload the page if it keeps happening.
      </Message>
      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
