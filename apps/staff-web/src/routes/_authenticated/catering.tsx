import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../../features/onboard-products/Sidebar'
import layoutStyles from '../../features/onboard-products/Layout.module.css'

// F12 layout: renders the dark navy sidebar plus the page Outlet.
// Only F12 pages live under this layout, so the sidebar is scoped to /catering/* and
// does not appear on /dashboard or other groups' pages.
export const Route = createFileRoute('/_authenticated/catering')({
  component: CateringLayout,
})

function CateringLayout() {
  return (
    <div className={layoutStyles.shell}>
      <Sidebar />
      <main className={layoutStyles.main}>
        <Outlet />
      </main>
    </div>
  )
}
