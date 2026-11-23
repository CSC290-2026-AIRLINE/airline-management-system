import { Component, type ErrorInfo, type ReactNode } from 'react'

interface FeatureErrorBoundaryProps {
  children: ReactNode
  /** Rendered instead of the children when a render throws. */
  fallback?: (error: string, reset: () => void) => ReactNode
}

interface FeatureErrorBoundaryState {
  error: string | null
}

/**
 * Keeps one bad render from blanking the whole route. Feature scopes own their boundary so a failure inside a
 * feature shows a card, not an empty page.
 */
export class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
  state: FeatureErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): FeatureErrorBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Reports & Analytics failed to render', error, info)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) {
      return this.props.children
    }
    if (this.props.fallback) {
      return this.props.fallback(error, this.reset)
    }
    return (
      <div className="raErrorCard" role="alert">
        <h2 className="ra-cardTitle">Something went wrong</h2>
        <p className="raEmptyStateText">{error}</p>
        <button type="button" className="raStatusPillButton" onClick={this.reset}>
          Try again
        </button>
      </div>
    )
  }
}
