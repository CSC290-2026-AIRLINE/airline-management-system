/* eslint-disable react-refresh/only-export-components -- this module intentionally pairs a provider with its hook */
import { createContext, useContext, type ReactNode } from 'react'

/**
 * The signed-in staff member's own role, as far as the console needs to know it.
 *
 * `RequireStaff` already fetches `GET /api/me/screens` once for the whole admin workspace, and that response carries
 * the caller's role. Passing it down through a context keeps it to that one request — the sidebar footer shows the
 * role name, and calling `useMyScreens()` a second time in `AdminShell` would fetch it again.
 */
export interface MyAccess {
  /** The role's code and display name, or `null` when the caller has no staff account (or the request failed). */
  role: { code: string; name: string } | null
}

const MyAccessContext = createContext<MyAccess>({ role: null })

export function MyAccessProvider({ value, children }: { value: MyAccess; children: ReactNode }) {
  return <MyAccessContext.Provider value={value}>{children}</MyAccessContext.Provider>
}

/** The caller's own role, or `null` outside a `RequireStaff` gate. */
export function useMyAccess(): MyAccess {
  return useContext(MyAccessContext)
}
