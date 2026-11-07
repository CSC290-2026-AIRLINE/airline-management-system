/** The three Feature 6 staff screens. `Customers` is Feature 7's page and is not part of this group. */
export type StaffPage = 'counter' | 'issues' | 'gate'

/** Where each screen lives, so the shell can navigate without knowing the router. */
export const PAGE_PATHS: Record<StaffPage, string> = {
  counter: '/check-in/counter',
  issues: '/check-in/issues',
  gate: '/check-in/gate',
}

/** The screen a URL belongs to: the longest path that prefixes it, or the counter when none does. */
export function pageFromPath(pathname: string): StaffPage {
  let page: StaffPage = 'counter'
  let length = 0
  for (const candidate of Object.keys(PAGE_PATHS) as StaffPage[]) {
    const path = PAGE_PATHS[candidate]
    if (pathname.startsWith(path) && path.length > length) {
      page = candidate
      length = path.length
    }
  }
  return page
}
