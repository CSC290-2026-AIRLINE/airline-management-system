import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import type { ApiError } from '../api/client'

export function ApiErrorBanner({ error }: { error: ApiError }) {
  return (
    <Alert variant="destructive" className="text-left">
      <CircleAlert />
      <AlertTitle className="font-mono text-xs">{error.status > 0 ? `${error.status} ${error.code}` : error.code}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}
