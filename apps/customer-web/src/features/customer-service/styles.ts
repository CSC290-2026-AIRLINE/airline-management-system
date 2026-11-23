import type { CSSProperties } from 'react'

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: '8px',
  border: '1px solid #DBE2EA',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  backgroundColor: '#FFFFFF',
  color: '#0A1424',
  transition: 'border-color 0.15s ease',
}

export const btnPrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 22px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#102544',
  color: '#FFFFFF',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
}

export const btnSecondary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 20px',
  borderRadius: '8px',
  border: '1px solid #C7CFDB',
  backgroundColor: '#FFFFFF',
  color: '#0A1424',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'border-color 0.15s ease',
}

export const errorStyle: CSSProperties = {
  fontSize: '13px',
  color: '#DC2626',
  marginTop: '4px',
  fontWeight: 500,
}

export const alertStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: '8px',
  backgroundColor: '#FEF2F2',
  border: '1px solid #FECACA',
  color: '#991B1B',
  fontSize: '14px',
}

export const successStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: '8px',
  backgroundColor: '#E0FAEB',
  border: '1px solid #B7EBCB',
  color: '#087338',
  fontSize: '13px',
  fontWeight: 500,
}

export const mutedStyle: CSSProperties = {
  fontSize: '13px',
  color: '#677287',
}

export const cardStyle: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  border: '1px solid #DBE2EA',
  padding: '24px',
  boxShadow: '0 2px 8px rgba(10, 20, 36, 0.04)',
  textAlign: 'left',
}

/** Tailwind classes for a visible keyboard focus ring (inline styles cannot target :focus-visible). */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]'

/** The same ring drawn inside the element, for full-width rows in a clipped list. */
export const focusRingInset = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2563EB]'
