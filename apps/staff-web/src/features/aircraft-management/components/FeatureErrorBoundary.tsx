import { Component, type ErrorInfo, type ReactNode } from 'react'

interface FeatureErrorBoundaryProps {
  children: ReactNode
}

interface FeatureErrorBoundaryState {
  message: string | null
}

/** Keeps one broken panel from blanking the whole route. */
export class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
  state: FeatureErrorBoundaryState = { message: null }

  private attempt = 0

  static getDerivedStateFromError(error: unknown): FeatureErrorBoundaryState {
    return { message: error instanceof Error ? error.message : 'Unexpected error' }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The aircraft management view crashed', error, info.componentStack)
  }

  private retry = () => {
    this.attempt += 1
    this.setState({ message: null })
  }

  render() {
    if (this.state.message) {
      return (
        <div className="f9-crash" role="alert">
          <h3>This view failed to render</h3>
          <p>{this.state.message}</p>
          <button type="button" className="f9-btn f9-btn--outline" onClick={this.retry}>
            Try again
          </button>
        </div>
      )
    }

    // The key forces a fresh mount, so a component that threw is not rendered with the same state.
    return <div key={this.attempt}>{this.props.children}</div>
  }
}
