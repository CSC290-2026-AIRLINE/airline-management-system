import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'

export function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function LoadingCard({ label = 'Loading…' }: { label?: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground" role="status">
        {label}
      </CardContent>
    </Card>
  )
}

export function LoadErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <ErrorAlert message={message} />
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}
