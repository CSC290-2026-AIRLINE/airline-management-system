import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from '@staff-web/components/ui/sonner'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/** Layout for every `/catering/*` page: the global staff sidebar around the page. */
export const Route = createFileRoute('/_authenticated/catering')({
  component: CateringWorkspace,
})

function CateringWorkspace() {
  const { isLoading, accessToken } = useAppAuth()
  return (
    <RequireStaff>
      <AppShell>
        <main className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 lg:px-[4%] lg:pt-12 lg:pb-16 [&_h1]:font-sans [&_h2]:font-sans">
          {/* Pages fetch on mount; wait for the token exchange so the first request is not sent without a bearer token (401). */}
          {isLoading || !accessToken ? <p>Loading…</p> : <Outlet />}
        </main>
        <Toaster position="top-center" />
      </AppShell>
    </RequireStaff>
  )
}
