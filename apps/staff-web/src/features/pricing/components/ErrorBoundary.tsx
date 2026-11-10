import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'

interface State {
  error: Error | null
}

// Keeps one broken panel from blanking the whole page.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertDescription className="block">
            This section failed to load: {this.state.error.message}{' '}
            <Button variant="link" className="h-auto p-0" type="button" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )
    }
    return this.props.children
  }
}
