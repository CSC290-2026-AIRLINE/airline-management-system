import { useState, type ReactNode } from 'react'
import { ProfileContext, type Profile, type Passenger } from './profile-context'
import './profile.css'

const exampleProfile: Profile = {
  firstName: 'Anya',
  lastName: 'Saranpat',
  email: 'anya.s@example.com',
  phone: '+66 81 234 5678',
  dateOfBirth: '1995-04-14',
  nationality: 'Thai',
  gender: 'Female',
  photo: null,
}
const examplePassengers: Passenger[] = [
  { id: 'somchai', name: 'Somchai Saranpat', relationship: 'Spouse', dateOfBirth: '1992-08-12', gender: 'Male', nationality: 'Thai' },
  { id: 'niran', name: 'Niran Saranpat', relationship: 'Child', dateOfBirth: '2016-03-03', gender: 'Male', nationality: 'Thai' },
  {
    id: 'kamol',
    name: 'Kamol Saranpat · กมล สารพัฒน์',
    relationship: 'Parent',
    dateOfBirth: '1966-01-22',
    gender: 'Male',
    nationality: 'Thai',
  },
]

// Frontend prototype state only. Replace these fixtures with the profile API when available.
export default function AccountProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(exampleProfile)
  const [passengers, setPassengers] = useState(examplePassengers)
  return (
    <ProfileContext.Provider
      value={{
        profile,
        passengers,
        updateProfile: (changes) => setProfile((previous) => ({ ...previous, ...changes })),
        savePassenger: (passenger) =>
          setPassengers((previous) =>
            previous.some((item) => item.id === passenger.id)
              ? previous.map((item) => (item.id === passenger.id ? passenger : item))
              : [...previous, passenger],
          ),
        removePassenger: (id) => setPassengers((previous) => previous.filter((item) => item.id !== id)),
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}
