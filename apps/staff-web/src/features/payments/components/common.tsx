import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { cn } from '@staff-web/lib/utils'
import { TONE_CLASS, type Tone } from '../format'

/** A Payments & Refunds page: header plus an error boundary so one bad render never blanks the route. */
export function PaymentsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-heading text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </header>
      <PageErrorBoundary>{children}</PageErrorBoundary>
    </main>
  )
}

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge className={cn(TONE_CLASS[tone])}>{children}</Badge>
}

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

export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{children}</CardContent>
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

/** The textarea the shadcn kit does not have yet, styled like its Input. */
export function NoteField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <textarea
      id={id}
      value={value}
      maxLength={500}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  )
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Payments page crashed', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <LoadErrorCard message="This page could not be shown." onRetry={() => this.setState({ failed: false })} />
    }
    return this.props.children
  }
}
