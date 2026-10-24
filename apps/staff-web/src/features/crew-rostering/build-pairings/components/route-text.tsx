import { Fragment } from 'react'
import { ArrowRightIcon } from '../../shared/ui'

/** `BKK → NRT → BKK` with a drawn arrow, so it looks the same in every font. */
export function RouteText({
  route,
  arrowClassName = 'text-primary-text/40',
  arrowSize = 'h-4 w-4',
}: {
  route: readonly string[]
  arrowClassName?: string
  arrowSize?: string
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {route.map((airport, index) => (
        <Fragment key={`${airport}-${index}`}>
          {index > 0 && <ArrowRightIcon className={`${arrowSize} shrink-0 ${arrowClassName}`} />}
          {airport}
        </Fragment>
      ))}
    </span>
  )
}
