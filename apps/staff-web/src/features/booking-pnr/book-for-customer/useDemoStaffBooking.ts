import { useEffect, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { DemoPassenger } from '../../../../../customer-web/src/features/booking-pnr/passengers/demo-passengers'

export interface DemoBookingCustomer {
  id: string
  name: string
  email: string
  phone: string
}
export function useDemoStaffBooking() {
  const { fetchWithAuth, isLoading } = useAppAuth()
  const [customers, setCustomers] = useState<DemoBookingCustomer[]>([])
  const [profiles, setProfiles] = useState<DemoPassenger[]>([])
  const [loading, setLoading] = useState(import.meta.env.DEV)
  const [error, setError] = useState<string | null>(
    import.meta.env.DEV ? null : 'Customer selection is unavailable until the passenger-profile integration is connected.',
  )
  useEffect(() => {
    if (!import.meta.env.DEV || isLoading) return
    let active = true
    const controller = new AbortController()
    async function load() {
      try {
        const results = await Promise.all([
          fetchWithAuth('/api/dev/staff/booking-customers', { signal: controller.signal }),
          fetchWithAuth('/api/dev/booking-passengers', { signal: controller.signal }),
        ])
        if (results.some((response) => response.status === 403))
          throw new Error('An active staff account is required to book for a customer.')
        if (results.some((response) => !response.ok))
          throw new Error('Demo booking data is unavailable. Check that the local demo seed has been loaded.')
        const [customerRows, passengerRows] = (await Promise.all(results.map((response) => response.json()))) as [
          DemoBookingCustomer[],
          DemoPassenger[],
        ]
        if (active) {
          setCustomers(customerRows)
          setProfiles(passengerRows)
          setError(
            customerRows.length && passengerRows.length
              ? null
              : 'No demo customer or travellers are available. Load the Feature 3 demo data first.',
          )
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load booking data.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [fetchWithAuth, isLoading])
  return { customers, profiles, loading, error }
}
