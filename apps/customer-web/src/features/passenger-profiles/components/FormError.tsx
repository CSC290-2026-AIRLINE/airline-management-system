import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'

export default function FormError({ children, role = 'alert' }: { children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <Alert variant="destructive" role={role}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
