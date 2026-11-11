import { Alert, AlertDescription } from '@staff-web/components/ui/alert'

interface NoticeProps {
  text?: string
}

// The green "saved / added / removed" message at the top of a card. The live region stays mounted so screen readers announce it.
export function Notice({ text }: NoticeProps) {
  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {text && (
        <Alert className="border-0 bg-(--pr-good-bg) py-2.5 text-(--pr-good)">
          <AlertDescription className="block font-semibold text-(--pr-good)">{text}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
