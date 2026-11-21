import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'

/**
 * Keeps `dateFrom`, `dateTo` and `base` in the URL in step with the window on screen, so a reload or a shared link opens
 * what the operator is looking at. It replaces the history entry instead of adding one, so Back still leaves the page.
 * Anything else in the search (a run id) is kept.
 */
export function useWindowInUrl({ dateFrom, dateTo, base }: { dateFrom: string; dateTo: string; base: string }): void {
  const navigate = useNavigate()
  useEffect(() => {
    void navigate({
      to: '.',
      search: (previous: Record<string, unknown>) => ({ ...previous, dateFrom, dateTo, base }),
      replace: true,
    })
  }, [navigate, dateFrom, dateTo, base])
}
