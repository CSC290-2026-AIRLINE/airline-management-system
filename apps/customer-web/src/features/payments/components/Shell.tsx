import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { Tone } from '../format'
import '../payments.css'

/** Payment pages (checkout, payment result, fake hosted page): no account links, so nothing pulls the customer away. */
export function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="pay">
      <header className="pay-top">
        <span className="pay-brand">Flython · Secure checkout</span>
      </header>
      <main className="pay-main pay-main--narrow">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  )
}

/** My account pages: Receipts, My refunds and My vouchers. */
export function AccountShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="pay">
      <header className="pay-top">
        <Link to="/dashboard" className="pay-brand">
          Flython · My account
        </Link>
        <nav className="pay-nav" aria-label="My account">
          <Link to="/account/receipts">Receipts</Link>
          <Link to="/account/refunds">My refunds</Link>
          <Link to="/account/vouchers">My vouchers</Link>
        </nav>
      </header>
      <main className="pay-main">
        <h1 className="pay-h1">{title}</h1>
        {subtitle && <p className="pay-sub">{subtitle}</p>}
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  )
}

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="pay-chip" data-tone={tone}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className="pay-notice" data-tone={tone} role={tone === 'bad' ? 'alert' : undefined}>
      {children}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="pay-state" role="status">
      <div className="pay-spinner" aria-hidden="true" />
      <p className="pay-muted">{label}</p>
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="pay-card">
      <Notice tone="bad">{message}</Notice>
      {onRetry && (
        <button type="button" className="pay-btn pay-btn--ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="pay-card pay-state">
      <p className="pay-muted">{children}</p>
    </div>
  )
}

/** One bad render must not blank the whole route. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Payments page crashed', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <LoadError message="This page could not be shown. Reload to try again." onRetry={() => this.setState({ failed: false })} />
    }
    return this.props.children
  }
}
