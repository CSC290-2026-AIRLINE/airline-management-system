/**
 * The progress row: what is left to do, and the publish gate.
 *
 * The segmented bar has a fixed length — one segment per item the run has ever had —
 * so closing a break shortens the red rather than making every remaining segment look
 * closer to done. It only grows when the rules raise something new, which is exactly
 * when the bar should get longer.
 *
 * The bar shows a few segments at a time and scrolls for the rest, so a run with hundreds of breaks
 * keeps the same compact card. It scrolls itself to the first open segment, so the line between
 * closed and open is the part in view.
 *
 * On a phone it is just the counter: the heading is the page title already, and the publish
 * button lives in the fixed bottom bar.
 */
import { useEffect, useRef } from 'react'

interface ProgressHeaderProps {
  /** `Open breaks`, `Sick call` or `Uncovered leg`. */
  heading: string
  openCount: number
  totalItems: number
  /** True when what is open is a seat rather than a rule. */
  seatOnly: boolean
  canPublish: boolean
  isPublished: boolean
  onPublish: () => void
}

export function ProgressHeader({ heading, openCount, totalItems, seatOnly, canPublish, isPublished, onPublish }: ProgressHeaderProps) {
  const closed = Math.max(totalItems - openCount, 0)
  const barRef = useRef<HTMLOListElement>(null)
  const shown = useRef(false)
  const noun = seatOnly ? 'open seat' : 'rule break'
  // On a live roster the denominator is noise: the run is already published, so only what is open matters.
  const count =
    isPublished && !seatOnly
      ? `${noun}${openCount === 1 ? '' : 's'} open`
      : openCount === 1
        ? seatOnly
          ? 'open seat to fill'
          : `of ${totalItems} ${noun} left`
        : seatOnly
          ? 'open seats to fill'
          : `of ${totalItems} ${noun}s left`

  // Keep the last closed segment in view, so what is left is visible beside it. The first placement is instant; after that,
  // closing a break slides the line along.
  useEffect(() => {
    const bar = barRef.current
    const last = bar?.children[Math.max(closed - 1, 0)]
    if (!bar || !(last instanceof HTMLElement)) return
    bar.scrollTo({ left: Math.max(last.offsetLeft - bar.offsetLeft - 8, 0), behavior: shown.current ? 'smooth' : 'auto' })
    shown.current = true
  }, [closed, totalItems])

  return (
    <section aria-label={heading} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
      <h2 className="hidden text-3xl font-extrabold tracking-tight text-primary-text lg:block lg:shrink-0">{heading}</h2>

      {/* Right-aligned beside the publish button. `min-w-0` lets the card shrink on a narrow screen instead of pushing the page wider. */}
      <div className="flex w-full flex-wrap items-start gap-3 lg:w-auto lg:min-w-0 lg:flex-nowrap lg:justify-end">
        <div className="flex w-full min-w-0 items-center justify-between gap-2.5 rounded-2xl border border-border-desc/40 bg-card-bg px-5 py-3.5 lg:w-auto lg:justify-start">
          <span className="flex shrink-0 items-center gap-2.5">
            <span className="text-3xl leading-none font-extrabold text-invalid">{openCount}</span>
            <span className="text-sm text-primary-text/60">{count}</span>
          </span>

          {/* Five segments wide, with a sliver of the sixth on a wide screen, so the next one peeks in and shows there is more to scroll to;
              on a phone it takes the rest of the card. */}
          <ol
            ref={barRef}
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:thin] lg:max-w-[11.5rem] lg:flex-none"
            aria-label={`${closed} closed, ${openCount} open`}
          >
            {Array.from({ length: Math.max(totalItems, openCount) }, (_, index) => (
              <li
                key={index}
                aria-hidden="true"
                className={`h-2.5 w-7 shrink-0 rounded-full ${index < closed ? 'bg-valid' : 'bg-invalid/25'}`}
              />
            ))}
          </ol>
        </div>

        {!isPublished && (
          <div className="relative hidden shrink-0 pb-10 lg:block">
            {/* The reason under the button takes no part in the column's width, so the counter stays right beside the
                button and the text spills to the left beneath it. `pb-10` keeps the room it needs, enough to clear the counter card beside it.

                Not `<Button>`: the shared button fades itself to 50% when disabled, and a half-faded yellow reads as
                "almost ready" rather than "not yet". A grey fill says the gate is shut. */}
            <button
              type="button"
              onClick={onPublish}
              disabled={!canPublish}
              className={`inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                canPublish
                  ? 'bg-btn-yellow text-primary-text hover:bg-btn-yellow-hover focus-visible:outline-btn-yellow'
                  : 'cursor-not-allowed bg-border-desc/70 text-white'
              }`}
            >
              Publish roster
            </button>
            {!canPublish && (
              <p className="absolute right-0 bottom-0 text-[13px] font-medium whitespace-nowrap text-invalid">
                ROSTER_HAS_BREAKS · close {openCount} open {openCount === 1 ? 'break' : 'breaks'} to publish
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
