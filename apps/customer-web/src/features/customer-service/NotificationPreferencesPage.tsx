import { useEffect, useEffectEvent, useState } from 'react'
import type { NotificationPreferenceRow } from './types'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnSecondary, focusRing } from './styles'
import { AccountGate, ComplaintsNav } from './ui'

type Channel = 'email' | 'sms' | 'push'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'push', label: 'Push' },
]

export function NotificationPreferencesPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F7F9FC',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#0A1424',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main style={{ maxWidth: '1000px', width: '100%', margin: '32px auto', padding: '0 24px 80px', boxSizing: 'border-box' }}>
        <ComplaintsNav current="/complaints/preferences" />
        <AccountGate signInTitle="Sign in to manage notifications" redirect="/complaints/preferences">
          {() => <PreferencesForm />}
        </AccountGate>
      </main>
    </div>
  )
}

function PreferencesForm() {
  const api = useComplaintsApi()
  const [preferences, setPreferences] = useState<NotificationPreferenceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  const fetchPreferences = useEffectEvent(() => api.getNotificationPreferences())

  useEffect(() => {
    let active = true
    fetchPreferences()
      .then((data) => {
        if (active) setPreferences(Array.isArray(data) ? data : [])
      })
      .catch((err: unknown) => {
        if (active) setLoadError(errorMessage(err))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadAttempt])

  function retryLoad() {
    setLoadError(null)
    setIsLoading(true)
    setLoadAttempt((n) => n + 1)
  }

  function handleToggle(row: NotificationPreferenceRow, channel: Channel) {
    // A mandatory notice must stay on for at least one channel.
    if (row[channel] && row.isMandatory && !CHANNELS.some(({ key }) => key !== channel && row[key])) {
      setNotice(`"${row.typeName}" is a critical flight alert and must stay on for at least one channel.`)
      return
    }
    setNotice(null)
    setPreferences((prev) => prev.map((r) => (r.typeCode === row.typeCode ? { ...r, [channel]: !r[channel] } : r)))
    setIsSaved(false)
  }

  async function handleSave() {
    try {
      setIsSaving(true)
      setError(null)
      const updated = await api.updateNotificationPreferences(preferences)
      if (Array.isArray(updated) && updated.length > 0) {
        setPreferences(updated)
      }
      setIsSaved(true)
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 50)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = !isSaving && !isLoading && !loadError && preferences.length > 0

  return (
    <>
      {/* Saved Banner (Figma 10) */}
      {isSaved && (
        <div
          role="status"
          style={{
            backgroundColor: '#DCFCE7',
            border: '1px solid #86EFAC',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span aria-hidden="true" style={{ fontSize: '20px', color: '#16A34A', fontWeight: 700 }}>
              ✓
            </span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#14532D' }}>Preferences saved</div>
              <div style={{ fontSize: '13px', color: '#166534', marginTop: '2px' }}>
                Your notification settings have been updated across email, SMS and push.
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss saved message"
            onClick={() => setIsSaved(false)}
            className={focusRing}
            style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Save Error Banner */}
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#991B1B',
            fontSize: '14px',
          }}
        >
          <div>{error}</div>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className={focusRing}
            style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Card Container (Figma 09) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #DBE2EA',
          padding: '32px',
          boxShadow: '0 2px 8px rgba(10, 20, 36, 0.04)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '28px', borderBottom: '1px solid #F1F5F9', paddingBottom: '20px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: 700, color: '#0A1424', letterSpacing: '-0.02em' }}>
            Notification preferences
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#677287', lineHeight: 1.5 }}>
            Choose how you receive flight alerts and customer service notices. Critical messages (flight delays, cancellations and gate
            changes) are always sent on at least one channel.
          </p>
        </div>

        {notice && (
          <div role="alert" style={{ ...alertStyle, marginBottom: '16px' }}>
            {notice}
          </div>
        )}

        {/* Preferences Matrix Table */}
        <div style={{ overflowX: 'auto', marginBottom: '32px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid #E2E8F0',
                  color: '#677287',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '12px 14px' }}>EVENT TYPE</th>
                <th style={{ padding: '12px 14px' }}>SERVICE</th>
                {CHANNELS.map(({ key, label }) => (
                  <th key={key} style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} role="status" style={{ padding: '14px', color: '#677287' }}>
                    Loading your preferences…
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={5} style={{ padding: '14px' }}>
                    <div
                      role="alert"
                      style={{ ...alertStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
                    >
                      <span>We couldn't load your preferences. {loadError}</span>
                      <button type="button" onClick={retryLoad} className={focusRing} style={btnSecondary}>
                        Try again
                      </button>
                    </div>
                  </td>
                </tr>
              ) : preferences.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '14px', color: '#677287' }}>
                    There are no notifications to set up yet.
                  </td>
                </tr>
              ) : (
                preferences.map((row) => (
                  <tr key={row.typeCode} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px' }}>
                      <div style={{ fontWeight: 600, color: '#0A1424' }}>
                        {row.typeName}
                        {row.isMandatory && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#B45309',
                              backgroundColor: '#FEF3C7',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              verticalAlign: 'middle',
                            }}
                          >
                            ALWAYS ON
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px', color: '#677287', fontSize: '13px' }}>{row.sourceFeature}</td>
                    {CHANNELS.map(({ key, label }) => (
                      <td key={key} style={{ padding: '14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`${label} for ${row.typeName}`}
                          checked={row[key]}
                          onChange={() => handleToggle(row, key)}
                          className={focusRing}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563EB' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Action Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '20px',
            borderTop: '1px solid #F1F5F9',
          }}
        >
          <div style={{ fontSize: '13px', color: '#677287' }}>All notifications are delivered via mocked channels in real time.</div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className={focusRing}
            style={{
              backgroundColor: canSave ? '#102544' : '#94A3B8',
              color: '#FFFFFF',
              padding: '11px 24px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: '0 2px 4px rgba(10, 20, 36, 0.08)',
            }}
          >
            {isSaving ? 'Saving...' : 'Save preferences'}
          </button>
        </div>
      </div>
    </>
  )
}
