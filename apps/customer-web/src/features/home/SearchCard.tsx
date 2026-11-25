import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Package, Plane } from 'lucide-react'
import { FlightSearchForm } from '@customer-web/features/booking-search/components/FlightSearchForm'
import type { FlightSearchFormValue } from '@customer-web/features/booking-search/components/contracts'
import { defaultFlightSearchValue, flightSearchParamsFromState } from '@customer-web/features/booking-search/search-params'
import { Button } from '@customer-web/components/ui/button'

const onHero = 'text-white hover:bg-white/15 hover:text-white focus-visible:border-white focus-visible:ring-white/60'

/**
 * Hero search. It is the same form as `/search` (one-way, return and multi-city, the same passengers and the same
 * validation), so the two cannot drift apart. A valid search opens `/search` with the results already showing.
 */
export function SearchCard() {
  const navigate = useNavigate()
  const [value, setValue] = useState<FlightSearchFormValue>(defaultFlightSearchValue)

  function search(form: FlightSearchFormValue) {
    void navigate({
      to: '/search',
      search: flightSearchParamsFromState({ form, submitted: true, sort: 'price', picks: [] }),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A solid navy segmented control, so the links stay readable over the white aircraft in the photo at any width. */}
      <nav aria-label="Services" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-navy/85 p-1">
        <Button asChild variant="secondary" size="sm">
          <span aria-current="page">
            <Plane />
            Flight
          </span>
        </Button>
        {/* On the dark hero the navy focus ring would vanish, so these two carry a white one. */}
        <Button asChild variant="ghost" size="sm" className={onHero}>
          <Link to="/check-in">
            <CircleCheck />
            Check in
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className={onHero}>
          <Link to="/cargo/ship">
            <Package />
            Cargo
          </Link>
        </Button>
      </nav>
      <div className="text-left shadow-lg">
        <FlightSearchForm value={value} onChange={setValue} onSubmit={search} hidePassengers />
      </div>
    </div>
  )
}
