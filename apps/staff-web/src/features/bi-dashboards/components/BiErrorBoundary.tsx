import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'

interface BiErrorBoundaryProps {
  /** Names the section in the message, so the reader knows which part is missing. */
  label: string
  children: ReactNode
}

interface BiErrorBoundaryState {
  failed: boolean
}

/**
 * Keeps one broken section of the BI page from blanking the rest of it. The other sections keep working, and the
 * section offers a retry instead of a blank space.
 */
export class BiErrorBoundary extends Component<BiErrorBoundaryProps, BiErrorBoundaryState> {
  state: BiErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): BiErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logged for developers; the reader sees the plain message below.
    console.error(`BI section "${this.props.label}" failed`, error, info.componentStack)
  }

  private retry = () => this.setState({ failed: false })

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Alert variant="destructive" role="alert" className="print:hidden">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>{this.props.label} could not be shown</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>The rest of the page still works. Try this section again.</span>
          <Button type="button" variant="outline" size="sm" onClick={this.retry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
}
