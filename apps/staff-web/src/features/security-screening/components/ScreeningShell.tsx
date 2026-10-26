import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import screeningIcon from '../assets/screening.svg'
import watchlistIcon from '../assets/watchlist.svg'
import '../fonts.css'
import '../screening.css'

export function ScreeningShell({
  children,
  reviewing = false,
  held,
  onQueue,
  onSignOut,
  activeTab = 'queue',
  navigationDisabled = false,
}: {
  children: ReactNode
  reviewing?: boolean
  held?: number
  onQueue?: () => void
  onSignOut?: () => void | Promise<void>
  activeTab?: 'queue' | 'watchlist'
  navigationDisabled?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const sidebarId = useId()
  const mobileMenuId = useId()
  const mobileMenu = useRef<HTMLDialogElement>(null)
  const closingAnimation = useRef<Animation | null>(null)
  function closeMobileMenu() {
    const dialog = mobileMenu.current
    if (!dialog || closingAnimation.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMenuOpen(false)
      return
    }
    const animation = dialog.animate([{ transform: getComputedStyle(dialog).transform }, { transform: 'translateX(-100%)' }], {
      duration: 180,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'forwards',
    })
    closingAnimation.current = animation
    void animation.finished.then(
      () => setMenuOpen(false),
      () => {},
    )
  }
  useEffect(() => {
    const dialog = mobileMenu.current
    if (!dialog || !menuOpen) return
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      closingAnimation.current?.cancel()
      closingAnimation.current = null
      dialog.close()
      document.body.style.overflow = previousOverflow
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [menuOpen])
  const queueClass = activeTab === 'queue' ? 'sq-tab-active' : undefined
  const queueLabel = (
    <>
      <img src={screeningIcon} alt="" />
      Screening Queue{' '}
      {held !== undefined && held > 0 && (
        <span className="sq-held-count">
          <span>{held}</span>
          <span className="sq-desktop-only"> held</span>
        </span>
      )}
    </>
  )
  async function signOut() {
    if (!onSignOut || signingOut || navigationDisabled) return
    setSigningOut(true)
    setSignOutError('')
    try {
      await onSignOut()
    } catch {
      setSignOutError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  return (
    <div className="sq-app">
      <aside id={sidebarId} className="sq-sidebar">
        <div className="sq-brand">Airlines</div>
        <div className="sq-brand-line" />
        <p className="sq-workspace">ADMIN WORKSPACE</p>
        <nav aria-label="Staff navigation">
          <Link to="/customer-search" viewTransition preload="intent" disabled={navigationDisabled} onClick={() => setMenuOpen(false)}>
            Customer Search
          </Link>
          {onQueue ? (
            <button
              className="sq-nav-active"
              disabled={navigationDisabled}
              onClick={() => {
                onQueue()
                setMenuOpen(false)
              }}
            >
              Security Screening
            </button>
          ) : (
            <Link
              viewTransition
              preload="render"
              to="/security-screening/screening-queue"
              search={{ status: 'needs-review' }}
              className="sq-nav-active"
              disabled={navigationDisabled}
            >
              Security Screening
            </Link>
          )}
        </nav>
        <div className="sq-account">
          <strong>Administrator</strong>
          <p>Navigation follows assigned staff permissions.</p>
          <button disabled={!onSignOut || signingOut || navigationDisabled} onClick={() => void signOut()}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <dialog
        ref={mobileMenu}
        id={mobileMenuId}
        className="sq-mobile-navigation"
        aria-label="Staff navigation"
        onCancel={(event) => {
          event.preventDefault()
          closeMobileMenu()
        }}
      >
        <div className="sq-mobile-navigation-top">
          <span className="sq-mobile-navigation-brand">Airlines</span>
          <button type="button" className="sq-mobile-navigation-close" aria-label="Close navigation" onClick={closeMobileMenu}>
            ✕
          </button>
        </div>
        <div className="sq-mobile-navigation-line" />
        <nav aria-label="Mobile staff navigation">
          <Link to="/customer-search" disabled={navigationDisabled} onClick={() => setMenuOpen(false)}>
            <span>Customer Search</span>
            <small>Find any customer or passenger · read-only</small>
          </Link>
          {onQueue ? (
            <button
              type="button"
              disabled={navigationDisabled}
              onClick={() => {
                onQueue()
                setMenuOpen(false)
              }}
            >
              <span>Security Screening</span>
              <small>Screening Queue · Watchlist · security role only</small>
            </button>
          ) : (
            <Link
              to="/security-screening/screening-queue"
              search={{ status: 'needs-review' }}
              disabled={navigationDisabled}
              onClick={() => setMenuOpen(false)}
            >
              <span>Security Screening</span>
              <small>Screening Queue · Watchlist · security role only</small>
            </Link>
          )}
        </nav>
        <div className="sq-mobile-navigation-footer">
          <strong>Administrator</strong>
          <button type="button" disabled={!onSignOut || signingOut || navigationDisabled} onClick={() => void signOut()}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          {signOutError && <p role="alert">{signOutError}</p>}
        </div>
      </dialog>
      <div className="sq-main">
        <header className="sq-header">
          <div className="sq-mobile-header">
            <span className="sq-brand">Airlines</span>
            <span className="sq-staff">STAFF</span>
            <button
              className="sq-menu"
              aria-label="Toggle staff menu"
              aria-expanded={menuOpen}
              aria-controls={mobileMenuId}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className="sq-heading sq-desktop-heading">
            <h1>{reviewing ? 'Screening review' : 'Security Screening'}</h1>
          </div>
          <div className="sq-heading sq-mobile-heading">
            <h1>Security Screening</h1>
          </div>
          <nav className="sq-tabs" aria-label="Security screening">
            {onQueue ? (
              <button
                className={queueClass}
                onClick={onQueue}
                disabled={navigationDisabled}
                aria-current={activeTab === 'queue' ? 'page' : undefined}
              >
                {queueLabel}
              </button>
            ) : (
              <Link
                viewTransition
                preload="render"
                to="/security-screening/screening-queue"
                search={{ status: 'needs-review' }}
                className={queueClass}
                disabled={navigationDisabled}
                aria-current={activeTab === 'queue' ? 'page' : undefined}
              >
                {queueLabel}
              </Link>
            )}
            <Link
              viewTransition
              preload="render"
              to="/security-screening/watchlist"
              className={activeTab === 'watchlist' ? 'sq-tab-active' : undefined}
              disabled={navigationDisabled}
              aria-current={activeTab === 'watchlist' ? 'page' : undefined}
            >
              <img src={watchlistIcon} alt="" />
              Watchlist
            </Link>
          </nav>
        </header>
        <main className="sq-content">
          {signOutError && <p role="alert">{signOutError}</p>}
          {children}
        </main>
      </div>
    </div>
  )
}
