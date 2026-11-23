import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Route-level error boundary. Wraps an authenticated subtree so that one
// bad render in a feature doesn't blank the whole route. Uses shadcn
// Alert in the destructive variant for the visual.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfacing to the console; integrate with a real telemetry sink later.
    console.error('Route error boundary caught:', error, info)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <main className="bg-muted min-h-svh flex items-center justify-center px-6 py-12 font-sans">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            <p className="mb-3">{this.state.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ error: null })
              }}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }
}
