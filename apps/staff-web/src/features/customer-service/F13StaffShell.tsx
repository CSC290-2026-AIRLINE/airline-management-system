import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import flythonLogoDark from '../../assets/flython-logo-dark.svg'
import sidebarPattern from '../admin-console/assets/sidebar-pattern.png'
import { StaffChartsView, StaffDeliveryLogView, StaffTemplatesView } from './StaffExtraViews'

function useSimulationClock() {
  // Start simulation at Monday 12 Oct 2026, 20:30:00 (Figma seed date)
  const [simTime, setSimTime] = useState<Date>(() => new Date('2026-10-12T20:30:00'))

  useEffect(() => {
    const timer = setInterval(() => {
      setSimTime((prev) => new Date(prev.getTime() + 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const dayName = days[simTime.getDay()]
  const day = simTime.getDate()
  const month = months[simTime.getMonth()]
  const year = simTime.getFullYear()
  const hours = String(simTime.getHours()).padStart(2, '0')
  const minutes = String(simTime.getMinutes()).padStart(2, '0')

  return `${dayName} ${day} ${month} ${year}, ${hours}:${minutes}`
}

export function F13StaffShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { logout } = useAppAuth()
  const clockText = useSimulationClock()
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'queue' | 'charts' | 'delivery' | 'templates'>('queue')

  const navItems: { key: 'queue' | 'charts' | 'delivery' | 'templates'; label: string; short: string }[] = [
    { key: 'queue', label: 'Complaint queue', short: 'Q' },
    { key: 'charts', label: 'Charts', short: 'C' },
    { key: 'delivery', label: 'Delivery log', short: 'D' },
    { key: 'templates', label: 'Templates', short: 'T' },
  ]

  return (
    <div
      className="admin-shell"
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#F7F9FC',
        textAlign: 'left',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Feature 13 Dedicated Staff Sidebar matching Figma node 5340:33540 */}
      <aside
        style={{
          width: collapsed ? '72px' : '260px',
          minWidth: collapsed ? '72px' : '260px',
          backgroundColor: '#14213D',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: collapsed ? '22px 12px' : '22px',
          boxSizing: 'border-box',
          transition: 'width 0.2s ease, padding 0.2s ease',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          zIndex: 40,
          textAlign: 'left',
        }}
      >
        {/* Thai Geometric Pattern Overlay from Figma (mix-blend-luminosity opacity-60) */}
        <img
          src={sidebarPattern}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            mixBlendMode: 'luminosity',
            opacity: 0.6,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Top Part */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo & Collapse button row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '26px',
              paddingLeft: collapsed ? '0' : '6px',
            }}
          >
            {!collapsed ? (
              <div
                onClick={() => {
                  setActiveTab('queue')
                  void navigate({ to: '/complaints' })
                }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <img
                  src={flythonLogoDark}
                  alt="Flython Airlines"
                  style={{ height: '32px', width: 'auto', display: 'block' }}
                />
              </div>
            ) : (
              <div
                onClick={() => setCollapsed(false)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                  color: '#FF9D00',
                  cursor: 'pointer',
                  margin: '0 auto',
                }}
              >
                F
              </div>
            )}

            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(110, 135, 178, 0.8)',
                color: '#FFFFFF',
                fontSize: '20px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              {collapsed ? '›' : '‹'}
            </button>
          </div>

          {!collapsed && (
            <>
              {/* Staff context tag */}
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 400,
                  color: '#B7C1D1',
                  marginBottom: '30px',
                  paddingLeft: '6px',
                }}
              >
                STAFF · CUSTOMER SERVICE
              </div>

              {/* Navigation Header */}
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#B7C1D1',
                  letterSpacing: '0.88px',
                  textTransform: 'uppercase',
                  marginBottom: '12px',
                  paddingLeft: '6px',
                }}
              >
                CUSTOMER SERVICE
              </div>
            </>
          )}

          {/* Navigation Links (Feature 13 ONLY) */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map((item) => {
              const active = activeTab === item.key
              return (
                <div
                  key={item.key}
                  onClick={() => {
                    setActiveTab(item.key)
                    if (item.key === 'queue') {
                      void navigate({ to: '/complaints' })
                    }
                  }}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    backgroundColor: active ? '#293D61' : 'transparent',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {collapsed ? item.short : item.label}
                </div>
              )
            })}
          </nav>
        </div>

        {/* Bottom Part (Widgets & Info) */}
        {!collapsed && (
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
            {/* SIMULATION CLOCK Widget (Figma 5947:37488) */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#F59E0B',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.65)',
                    letterSpacing: '0.63px',
                    textTransform: 'uppercase',
                  }}
                >
                  SIMULATION CLOCK
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', textAlign: 'left' }}>
                {clockText}
              </div>
            </div>

            {/* SIGNED IN AS Widget (Figma 5947:37492) */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#2FA568',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.65)',
                    letterSpacing: '0.63px',
                    textTransform: 'uppercase',
                  }}
                >
                  SIGNED IN AS
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', textAlign: 'left' }}>
                Tong Charoen
              </div>
            </div>

            {/* Role Disclaimer */}
            <p
              style={{
                margin: '4px 0 0',
                paddingLeft: '6px',
                fontSize: '12px',
                color: '#B7C1D1',
                lineHeight: 1.4,
                textAlign: 'left',
              }}
            >
              Customer Service Staff (supervisor). Navigation follows assigned staff permissions.
            </p>

            {/* Sign Out link */}
            <button
              type="button"
              onClick={() => {
                void logout().then(() => navigate({ to: '/login' }))
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 0 0 6px',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', textAlign: 'left' }}>
        {activeTab === 'queue' && children}
        {activeTab === 'charts' && <StaffChartsView />}
        {activeTab === 'delivery' && <StaffDeliveryLogView />}
        {activeTab === 'templates' && <StaffTemplatesView />}
      </main>
    </div>
  )
}
