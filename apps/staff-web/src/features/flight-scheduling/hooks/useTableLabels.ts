import { useEffect, type RefObject } from 'react'

// Copies each column header onto the cells below it as data-label, so the stylesheet can show a table as stacked cards on a phone.
// A header with data-short gives its cells a shorter phone label too (Figma abbreviates a few).
// Re-runs when the page changes because rows come and go as data loads.
export function useTableLabels(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const label = () => {
      root.querySelectorAll('table').forEach((table) => {
        const ths = [...table.querySelectorAll('thead th')]
        const heads = ths.map((th) => th.textContent?.trim() ?? '')
        table.querySelectorAll('tbody tr').forEach((row) => {
          ;[...row.children].forEach((cell, i) => {
            if (cell.getAttribute('data-label') !== (heads[i] ?? '')) cell.setAttribute('data-label', heads[i] ?? '')
            const short = ths[i]?.getAttribute('data-short')
            if (short && cell.getAttribute('data-short') !== short) cell.setAttribute('data-short', short)
          })
        })
      })
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [ref])
}
