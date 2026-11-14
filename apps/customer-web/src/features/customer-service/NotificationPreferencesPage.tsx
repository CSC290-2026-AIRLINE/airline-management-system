import { useState, useEffect } from 'react'
import { CustomerNavbar } from './CustomerNavbar'
import type { NotificationPreferenceRow } from './types'
import { loadPreferences, savePreferences } from './types'

export function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<NotificationPreferenceRow[]>([])
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    setPreferences(loadPreferences())
  }, [])

  function handleToggle(typeCode: string, channel: 'email' | 'sms' | 'push') {
    setPreferences((prev) =>
      prev.map((row) => {
        if (row.typeCode !== typeCode) return row

        const currentVal = row[channel]
        const newVal = !currentVal

        // If turning off, check if mandatory and all channels would become false
        if (!newVal && row.isMandatory) {
          const remainingChannels = (['email', 'sms', 'push'] as const).filter(
            (ch) => ch !== channel && row[ch]
          )
          if (remainingChannels.length === 0) {
            alert(`"${row.typeName}" is a critical flight alert and must remain active on at least one channel.`)
            return row
          }
        }

        return {
          ...row,
          [channel]: newVal,
        }
      })
    )
    setIsSaved(false)
  }

  function handleSave() {
    savePreferences(preferences)
    setIsSaved(true)
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 50)
  }

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
      <CustomerNavbar />

      <main style={{ maxWidth: '1000px', width: '100%', margin: '32px auto', padding: '0 24px 80px' }}>
        {/* Saved Banner (Figma 10) */}
        {isSaved && (
          <div
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
              <span style={{ fontSize: '20px', color: '#16A34A', fontWeight: 700 }}>✓</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#14532D' }}>
                  Preferences saved
                </div>
                <div style={{ fontSize: '13px', color: '#166534', marginTop: '2px' }}>
                  Your notification settings have been updated across email, SMS and push.
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsSaved(false)}
              style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: '16px' }}
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
              Choose how you receive flight alerts and customer service notices. Critical messages (flight delays, cancellations and gate changes) are always sent on at least one channel.
            </p>
          </div>

          {/* Preferences Matrix Table */}
          <div style={{ overflowX: 'auto', marginBottom: '32px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#677287', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 14px' }}>EVENT TYPE</th>
                  <th style={{ padding: '12px 14px' }}>SERVICE</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>EMAIL</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>SMS</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>PUSH</th>
                </tr>
              </thead>
              <tbody>
                {preferences.map((row) => (
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
                    <td style={{ padding: '14px', color: '#677287', fontSize: '13px' }}>
                      {row.sourceFeature}
                    </td>

                    {/* Email Checkbox */}
                    <td style={{ padding: '14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.email}
                        onChange={() => handleToggle(row.typeCode, 'email')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563EB' }}
                      />
                    </td>

                    {/* SMS Checkbox */}
                    <td style={{ padding: '14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.sms}
                        onChange={() => handleToggle(row.typeCode, 'sms')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563EB' }}
                      />
                    </td>

                    {/* Push Checkbox */}
                    <td style={{ padding: '14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.push}
                        onChange={() => handleToggle(row.typeCode, 'push')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563EB' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: '13px', color: '#677287' }}>
              All notifications are delivered via mocked channels in real time.
            </div>
            <button
              onClick={handleSave}
              style={{
                backgroundColor: '#102544',
                color: '#FFFFFF',
                padding: '11px 24px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(10, 20, 36, 0.08)',
              }}
            >
              Save preferences
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
