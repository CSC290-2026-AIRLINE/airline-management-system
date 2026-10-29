import { Component, type ErrorInfo, type ReactNode } from 'react'

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
        <div className="pr-callout is-error" role="alert">
          This section failed to load: {this.state.error.message}{' '}
          <button type="button" className="pr-link-button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
