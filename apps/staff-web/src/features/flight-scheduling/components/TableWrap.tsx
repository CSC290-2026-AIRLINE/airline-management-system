import type { ReactNode } from 'react'

// Border and horizontal scroll around a .fs-table; on a phone the table inside turns into cards. `spaced` adds the gap under a heading.
export function TableWrap({ spaced = false, children }: { spaced?: boolean; children: ReactNode }) {
  return <div className={spaced ? 'fs-table-wrap fs-mt' : 'fs-table-wrap'}>{children}</div>
}
