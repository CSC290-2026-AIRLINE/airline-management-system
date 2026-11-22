import { Link, useRouter } from '@tanstack/react-router'

/**
 * Links to every page the router knows about. Generated from the route tree, so routes added under `src/routes/` show
 * up without editing this file. Layout-only and redirect-only routes (no component) and dynamic routes (`$id`, which
 * cannot be linked without an id) are left out.
 */
export function Sitemap() {
  const router = useRouter()

  const paths = Object.entries(router.routesByPath)
    .filter(([path, route]) => route.options.component !== undefined && !path.includes('$'))
    .map(([path]) => (path.length > 1 ? path.replace(/\/$/, '') : path))
    .sort()

  return (
    <nav aria-label="Sitemap" className="sitemap">
      <ul>
        {paths.map((path) => (
          <li key={path}>
            <Link to={path}>{path}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
