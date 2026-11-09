import { useEffect, useRef, useState } from 'react'

function computeRemaining(holdExpiresAt: string, serverNow: string): number {
  const offsetMs = Date.parse(serverNow) - Date.now()
  return Math.max(0, Date.parse(holdExpiresAt) - (Date.now() + offsetMs))
}

export function useHoldCountdown(holdExpiresAt: string, serverNow: string, onExpire: () => void, paused = false): number {
  const [remainingMs, setRemainingMs] = useState(() => computeRemaining(holdExpiresAt, serverNow))
  const onExpireRef = useRef(onExpire)
  const firedRef = useRef(false)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    firedRef.current = false
  }, [holdExpiresAt, serverNow])

  useEffect(() => {
    const offsetMs = Date.parse(serverNow) - Date.now()
    const endMs = Date.parse(holdExpiresAt)

    const tick = () => {
      const remaining = Math.max(0, endMs - (Date.now() + offsetMs))
      setRemainingMs(remaining)

      if (remaining === 0 && !paused && !firedRef.current) {
        firedRef.current = true
        onExpireRef.current()
      }
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [holdExpiresAt, serverNow, paused])

  return remainingMs
}
