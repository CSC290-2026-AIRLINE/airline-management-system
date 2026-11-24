import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Package, Plane } from 'lucide-react'
import { FlightSearchForm } from '@customer-web/features/booking-search/components/FlightSearchForm'
import type { FlightSearchFormValue } from '@customer-web/features/booking-search/components/contracts'
import { defaultFlightSearchValue, flightSearchParamsFromState } from '@customer-web/features/booking-search/search-params'
import { Button } from '@customer-web/components/ui/button'

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
      <nav aria-label="Services" className="flex gap-2 overflow-x-auto">
        <Button asChild variant="secondary" size="sm">
          <span aria-current="page">
            <Plane />
            Flight
          </span>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white">
          <Link to="/check-in">
            <CircleCheck />
            Check in
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white">
          <Link to="/cargo/ship">
            <Package />
            Cargo
          </Link>
        </Button>
      </nav>
      <div className="text-left shadow-lg">
        <FlightSearchForm value={value} onChange={setValue} onSubmit={search} />
      </div>
    </div>
  )
}
