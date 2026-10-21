import { createContext, useContext } from 'react'

export interface Profile {
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string
  nationality: string
  gender: string
  photo: string | null
}
export interface Passenger {
  firstName?: string
  lastName?: string
  localFirstName?: string
  localLastName?: string
  passportNumber?: string
  id: string
  name: string
  relationship: string
  dateOfBirth: string
  gender: string
  nationality: string
}
export interface AccountState {
  profile: Profile
  passengers: Passenger[]
  updateProfile: (changes: Partial<Profile>) => void
  savePassenger: (passenger: Passenger) => void
  removePassenger: (id: string) => void
}
export const ProfileContext = createContext<AccountState | null>(null)
export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('Account pages require AccountProvider')
  return context
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
export function birthDateLabel(value: string, compact = false) {
  if (!value) return 'Not set'
  const date = new Date(`${value}T00:00:00`)
  if (compact) return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
  return new Intl.DateTimeFormat('en-GB').format(date).replaceAll('/', ' / ')
}
