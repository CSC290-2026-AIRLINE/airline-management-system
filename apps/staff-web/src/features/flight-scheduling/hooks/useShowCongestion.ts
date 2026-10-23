import { useState } from 'react'

const KEY = 'fs-show-congestion'

// The "Show congestion" switch in the top bar. Congestion is a stretch-level-1 feature, so it can be hidden from the menu.
// ponytail: remembered in this browser only; it becomes a staff setting if the Settings page gets a backend.
export function useShowCongestion() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'off'
    } catch {
      return true
    }
  })
  const change = (next: boolean) => {
    setShow(next)
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off')
    } catch {
      // storage blocked: the choice lasts until the page reloads
    }
  }
  return [show, change] as const
}
