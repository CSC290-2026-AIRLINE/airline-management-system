import { useState } from 'react'

/** Rows per page on the Feature 10 staff lists. */
export const PAGE_SIZE = 20

/**
 * One page of a list that is already loaded. The page goes back to the first whenever `resetKey` changes (a new
 * filter or search), and stays in range when the list shrinks.
 */
export function usePage<T>(items: readonly T[], resetKey: string) {
  const [state, setState] = useState({ key: resetKey, page: 0 })
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const page = Math.min(state.key === resetKey ? state.page : 0, pageCount - 1)

  return {
    page,
    pageCount,
    total: items.length,
    items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    setPage: (next: number) => setState({ key: resetKey, page: Math.max(0, Math.min(next, pageCount - 1)) }),
  }
}
