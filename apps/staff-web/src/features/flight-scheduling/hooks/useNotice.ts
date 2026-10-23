import { useState } from 'react'

// A message that clears itself; show it with <Toast />.
export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null)
  function say(message: string) {
    setNotice(message)
    setTimeout(() => setNotice(null), 5000)
  }
  return [notice, say] as const
}
