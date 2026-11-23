import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

/**
 * Only a new page should send the window back to the top. A navigation that only changes the query string (a tab, a
 * page number, a picked row) keeps the reader where they are, so the scroll position is only reset when the pathname
 * changes. Back and forward are untouched: they restore the saved position, as the router does it itself.
 */
const commitLocation = router.commitLocation.bind(router)
router.commitLocation = (next) => {
  const samePage = router.state.location.pathname === next.pathname
  return commitLocation({ ...next, resetScroll: next.resetScroll ?? !samePage })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
