import { useCallback, useEffect, useState } from 'react'

// A short-lived confirmation message, e.g. "Gold rule saved · logged in Feature 15 audit log".
export function useToast(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const show = useCallback((text: string) => setMessage(text), [])
  return [message, show]
}
