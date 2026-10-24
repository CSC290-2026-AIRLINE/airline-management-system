// Temporary harness for checking a crew-rostering page without a Clerk session.
// Not part of the app; deleted once the layout has been verified.
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import './index.css'
import { SetupRulePage } from './features/crew-rostering/setup-rule/setup-rule'

const rootRoute = createRootRoute()
const ruleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <SetupRulePage /> })

const router = createRouter({
  routeTree: rootRoute.addChildren([ruleRoute]),
  // The harness is served from `/preview-crew.html`, so routes below it are
  // matched relative to that path.
  basepath: '/preview-crew.html',
  defaultNotFoundComponent: () => <p>nope</p>,
})

;(window as unknown as { __router: typeof router }).__router = router

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
