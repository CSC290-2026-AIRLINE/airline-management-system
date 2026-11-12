import type { CSSProperties } from 'react'

// Shared by the three complaint pages. customer-web has no Tailwind yet, so these are inline styles.

export const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 60%, #f0fdf4 100%)',
  fontFamily: 'system-ui, sans-serif',
  color: '#1e293b',
  textAlign: 'left',
}

export const headerStyle: CSSProperties = {
  background: '#fff',
  borderBottom: '1px solid #e2e8f0',
  padding: '14px 28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
}

export const cardStyle: CSSProperties = {
  maxWidth: '580px',
  margin: '40px auto',
  background: '#fff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  padding: '32px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  boxSizing: 'border-box',
}

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1.5px solid #e2e8f0',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#1e293b',
}

export const btnPrimary: CSSProperties = {
  flex: 1,
  padding: '11px 24px',
  borderRadius: '10px',
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
}

export const btnSecondary: CSSProperties = {
  padding: '11px 20px',
  borderRadius: '10px',
  border: '1.5px solid #e2e8f0',
  background: '#fff',
  color: '#374151',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
}

export const errorStyle: CSSProperties = { fontSize: '13px', color: '#dc2626', marginTop: '6px' }

export const alertStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: '10px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  fontSize: '14px',
}

export const mutedStyle: CSSProperties = { fontSize: '13px', color: '#64748b' }
