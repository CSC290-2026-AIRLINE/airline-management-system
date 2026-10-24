/**
 * The progress row: what is left to do, and the publish gate.
 *
 * The segmented bar has a fixed length — one segment per item the run has ever had —
 * so closing a break shortens the red rather than making every remaining segment look
 * closer to done. It only grows when the rules raise something new, which is exactly
 * when the bar should get longer.
 *
 * On a phone it is just the counter: the heading is the page title already, and the publish
 * button lives in the fixed bottom bar.
 */
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

  return (
    <section aria-label={heading} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
      <h2 className="hidden text-3xl font-extrabold tracking-tight text-primary-text lg:block">{heading}</h2>

      <div className="flex w-full flex-wrap items-start gap-3 lg:w-auto">
        <div className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-border-desc/40 bg-card-bg px-5 py-3.5 lg:w-auto lg:justify-start">
          <span className="flex items-center gap-2.5">
            <span className="text-3xl leading-none font-extrabold text-invalid">{openCount}</span>
            <span className="text-sm text-primary-text/60">{count}</span>
          </span>

          <ol className="flex items-center gap-1.5" aria-label={`${closed} closed, ${openCount} open`}>
            {Array.from({ length: Math.max(totalItems, openCount) }, (_, index) => (
              <li key={index} aria-hidden="true" className={`h-2.5 w-7 rounded-full ${index < closed ? 'bg-valid' : 'bg-invalid/25'}`} />
            ))}
          </ol>
        </div>

        {!isPublished && (
          <div className="hidden flex-col items-end gap-1.5 lg:flex">
            {/* Not `<Button>`: the shared button fades itself to 50% when disabled, and a
                half-faded yellow reads as "almost ready" rather than "not yet". A grey
                fill says the gate is shut. */}
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
              <p className="text-[13px] font-medium text-invalid">
                ROSTER_HAS_BREAKS · close {openCount} open {openCount === 1 ? 'break' : 'breaks'} to publish
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
