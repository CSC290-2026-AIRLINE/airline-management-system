import { useEffect } from 'react'
import { toast } from 'sonner'

// Confirmation message as a sonner toast; pair it with useNotice. The <Toaster /> is mounted once in StaffShell.
export function Toast({ message, tone = 'default' }: { message: string | null; tone?: 'default' | 'warn' }) {
  useEffect(() => {
    if (!message) return
    if (tone === 'warn') toast.warning(message)
    else toast(message)
  }, [message, tone])
  return null
}
