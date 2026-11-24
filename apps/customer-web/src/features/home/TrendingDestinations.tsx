import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, CircleAlert, PlaneTakeoff } from 'lucide-react'
import { AIRPORTS, airportCity } from '@customer-web/features/booking-search/components/airports'
import { flightSearchParamsFromState } from '@customer-web/features/booking-search/search-params'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardTitle } from '@customer-web/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/cw-select'
import { Label } from '@customer-web/components/ui/label'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { DESTINATIONS, formatMoney, type Destination } from './destinations'
import { useDestinationFares, type DestinationFare } from './useDestinationFares'

const shortDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function DestinationCard({ destination, fare, origin }: { destination: Destination; fare: DestinationFare; origin: string }) {
  const when = shortDay.format(new Date(`${fare.date}T12:00:00Z`))
  return (
    <Link
      to="/search"
      // One way on the day the fare was found, with the results already showing.
      search={flightSearchParamsFromState({
        form: {
          tripType: 'one_way',
          legs: [{ origin, destination: destination.code, date: fare.date }],
          adults: 1,
          children: 0,
          infants: 0,
          cabin: 'economy',
        },
        submitted: true,
        sort: 'price',
        picks: [],
      })}
      aria-label={`${destination.city}, ${destination.country}. One way from ${airportCity(origin)} on ${when}, from ${formatMoney(fare.price, fare.currency)}`}
      className="group flex w-full rounded-xl no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card className="w-full gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-lg">
        <div className="relative h-[190px] p-3.5">
          <img src={destination.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          <Badge className="relative">{destination.country}</Badge>
        </div>
        <CardContent className="flex flex-1 flex-col gap-1 py-6">
          <CardTitle className="text-xl">{destination.city}</CardTitle>
          <CardDescription>Economy · {when}</CardDescription>
          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">One way from</span>
              <span className="font-serif text-subheading font-bold">{formatMoney(fare.price, fare.currency)}</span>
            </div>
            {/* The whole card is the link, so this only has the look of a button and is not a second control. */}
            <Button asChild size="icon" className="bg-brand-accent text-on-brand-accent group-hover:bg-brand-accent/90">
              <span>
                <ArrowUpRight aria-hidden />
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function CardSkeleton() {
  return (
    <Card className="w-full gap-0 overflow-hidden py-0">
      <Skeleton className="h-48 rounded-none" />
      <CardContent className="flex flex-col gap-3 py-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-4 h-9 w-2/5" />
      </CardContent>
    </Card>
  )
}

export function TrendingDestinations() {
  const [origin, setOrigin] = useState('BKK')
  const state = useDestinationFares(origin)

  return (
    <section aria-labelledby="trending-heading" className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 id="trending-heading" className="m-0 text-heading">
            Trending destinations
          </h2>
          <p className="text-muted-foreground">Lowest fares departing from your city over the next three weeks.</p>
        </div>
        <div className="grid gap-2 sm:w-56">
          <Label htmlFor="home-departing-from">Departing from</Label>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger id="home-departing-from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AIRPORTS.map((airport) => (
                <SelectItem key={airport.code} value={airport.code}>
                  {airport.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading fares">
            {DESTINATIONS.map((destination) => (
              <li key={destination.code} className="flex">
                <CardSkeleton />
              </li>
            ))}
          </ul>
        )}
        {state.status === 'error' && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>We couldn't load fares right now</AlertTitle>
            <AlertDescription>
              Try again in a moment, or{' '}
              <Link to="/search" className="underline">
                search flights directly
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        {state.status === 'ready' &&
          (Object.keys(state.fares).length === 0 ? (
            <Alert>
              <PlaneTakeoff />
              <AlertTitle>No fares from {airportCity(origin)} yet</AlertTitle>
              <AlertDescription>There are no bookable economy fares in the next three weeks. Try another departure city.</AlertDescription>
            </Alert>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {DESTINATIONS.filter((destination) => state.fares[destination.code]).map((destination) => (
                <li key={destination.code} className="flex">
                  <DestinationCard destination={destination} fare={state.fares[destination.code]} origin={origin} />
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  )
}
