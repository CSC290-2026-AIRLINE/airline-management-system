import { createFileRoute } from '@tanstack/react-router'
import { CustomerSearchPage } from '@staff-web/features/customer-search/pages/CustomerSearchPage'
import {
  parseCustomerSearch,
  resolveCustomerSearch,
  toCustomerSearchParams,
  type ResolvedCustomerSearch,
} from '@staff-web/features/customer-search/lib/searchParams'

/**
 * Lives under `_authenticated/`, so it inherits the existing sign-in redirect
 * and the platform `AuthProvider`. It adds no login, token or session logic of
 * its own — see `src/auth/AuthProvider.tsx`.
 */
export const Route = createFileRoute('/_authenticated/customer-search')({
  validateSearch: parseCustomerSearch,
  component: CustomerSearchRoute,
})

// Thin route: it owns the URL contract and hands the feature everything else.
// The URL keeps only what the user chose, and the page reads a resolved state,
// so neither has to know about the other's representation.
function CustomerSearchRoute() {
  const search = resolveCustomerSearch(Route.useSearch())
  const navigate = Route.useNavigate()

  function onSearchChange(next: ResolvedCustomerSearch) {
    void navigate({ search: toCustomerSearchParams(next) })
  }

  return <CustomerSearchPage search={search} onSearchChange={onSearchChange} />
}
