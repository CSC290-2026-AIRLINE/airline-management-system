import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import flythonLogo from '../../assets/flython-logo.png'

interface CustomerNavbarProps {
  activeTab?: string
  isGuest?: boolean
  onSignInClick?: () => void
}

export function CustomerNavbar({ activeTab: _activeTab, isGuest = false, onSignInClick }: CustomerNavbarProps = {}) {
  const navigate = useNavigate()
  const { user, logout } = useAppAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        height: '68px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
        }}
      >
        {/* Brand Logo */}
        <div
          onClick={() => void navigate({ to: '/complaints' })}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <img
            src={flythonLogo}
            alt="Flython Airlines"
            style={{ height: '38px', width: 'auto', display: 'block' }}
          />
        </div>

        {/* Navigation links matching Figma */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          {(['Book', 'My Trips', 'Membership', 'Help'] as const).map((tab) => (
            <span
              key={tab}
              style={{
                fontSize: '14px',
                fontWeight: tab === 'Help' ? 700 : 500,
                color: tab === 'Help' ? '#0A1424' : '#4B5563',
                cursor: 'default',
                textDecoration: tab === 'Help' ? 'underline' : 'none',
                textUnderlineOffset: '6px',
                textDecorationThickness: '2px',
                userSelect: 'none',
              }}
            >
              {tab}
            </span>
          ))}

          {/* User Profile / Sign in Pill button */}
          {isGuest || !user ? (
            <div
              onClick={() => {
                sessionStorage.removeItem('f13_guest_mode')
                if (user && onSignInClick) {
                  onSignInClick()
                } else {
                  void navigate({ to: '/login', search: { redirect: '/complaints' } })
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 16px',
                borderRadius: '20px',
                backgroundColor: '#102544',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background-color 0.15s',
              }}
            >
              Sign in
            </div>
          ) : (
            <div
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 14px 6px 12px',
                borderRadius: '20px',
                backgroundColor: '#102544',
                color: '#FFFFFF',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background-color 0.15s',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '14px',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#1D4ED8',
                }}
              >
                SW
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>Profile</span>
            </div>
          )}
        </div>

        {/* Account Menu Dropdown (Figma Frame 01 - Account Menu Open) */}
        {!isGuest && menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 51,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '64px',
                right: '24px',
                width: '250px',
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow: '0 16px 36px -4px rgba(10, 20, 36, 0.14), 0 4px 12px -2px rgba(10, 20, 36, 0.08)',
                border: '1px solid #E2E8F0',
                padding: '16px',
                zIndex: 52,
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0A1424' }}>
                Somchai Wongsakul
              </div>
              <div style={{ fontSize: '12px', color: '#677287', marginTop: '2px', marginBottom: '12px' }}>
                {user?.email ?? 'somchai.w@example.com'}
              </div>

              <div
                style={{
                  borderTop: '1px solid #F1F5F9',
                  paddingTop: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '13px',
                }}
              >
                <div
                  style={{ color: '#64748B', padding: '6px 8px', borderRadius: '6px' }}
                >
                  My profile
                </div>
                <div
                  onClick={() => {
                    setMenuOpen(false)
                    void (navigate as any)({ to: '/complaints' })
                  }}
                  style={{
                    color: '#0A1424',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#F8FAFC',
                  }}
                >
                  Make a complaint
                </div>
                <div
                  onClick={() => {
                    sessionStorage.removeItem('f13_guest_mode')
                    setMenuOpen(false)
                    void (navigate as any)({
                      to: '/complaints/check',
                      search: { caseNumber: undefined, bookingRef: undefined, surname: undefined, guest: undefined },
                    })
                  }}
                  style={{
                    color: '#334155',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '6px',
                  }}
                >
                  Your complaints
                </div>
                <div
                  style={{
                    color: '#334155',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '6px',
                  }}
                  onClick={() => {
                    setMenuOpen(false)
                    void (navigate as any)({ to: '/complaints/preferences' })
                  }}
                >
                  Notification preferences
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '6px', paddingTop: '8px' }}>
                  <div
                    style={{ color: '#EF4444', fontWeight: 500, cursor: 'pointer', padding: '6px 8px' }}
                    onClick={() => {
                      setMenuOpen(false)
                      void logout().then(() => navigate({ to: '/login' }))
                    }}
                  >
                    Sign out
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
