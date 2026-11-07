import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Separator } from '@staff-web/components/ui/separator'
import type { BagMatch } from '../api/bag-matches'
import type { FoundBag } from '../api/found-bags'
import {
  BAG_TYPE_LABELS,
  MATCH_LEVEL_LABELS,
  MATCH_LEVEL_TONES,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_TONES,
  bagRef,
  colourLabel,
} from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { FormError, Pill, SelectBox } from './primitives'

/** "FB-0413 · Red backpack at ICN" */
function heldBagLabel(bag: FoundBag): string {
  const what = bag.bagType && bag.colour ? `${colourLabel(bag.colour)} ${BAG_TYPE_LABELS[bag.bagType].toLowerCase()}` : 'Not checked yet'
  return `${bagRef(bag.id)} · ${what} at ${bag.foundAirport}`
}

/** "Matches" and "Link a found bag by hand" in the case detail card (frame 01b). Rejected matches are left out. */
export function CaseMatches({
  matches,
  heldBags,
  canLink,
  onLink,
}: {
  matches: BagMatch[]
  heldBags: FoundBag[]
  /** Only an open or lost case can get a new match. */
  canLink: boolean
  onLink: (foundBagId: string) => Promise<unknown>
}) {
  const [bagId, setBagId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = matches.filter((m) => m.status !== 'rejected')
  // A pair can only be matched once, rejected or not, so bags already matched with this case are not offered.
  const linked = new Set(matches.map((m) => m.foundBag.id))
  const options = heldBags.filter((b) => !linked.has(b.id)).map((b) => ({ value: b.id, label: heldBagLabel(b) }))
  const chosen = options.some((o) => o.value === bagId) ? bagId : ''

  async function link() {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      await onLink(chosen)
      setBagId('')
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 className="m-0 font-sans text-[22px] font-semibold text-[#14213d]">Matches</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-[#677287]">No matches yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border border-[#d8dce6] px-3 py-2.5">
              <Pill tone={MATCH_LEVEL_TONES[m.level]}>{MATCH_LEVEL_LABELS[m.level]}</Pill>
              <span className="min-w-0 flex-1 text-base break-words text-[#14213d]">
                {bagRef(m.foundBag.id)} at {m.foundBag.currentAirport}
              </span>
              <Pill tone={MATCH_STATUS_TONES[m.status]}>{MATCH_STATUS_LABELS[m.status]}</Pill>
              <Button
                asChild
                className="h-auto rounded-lg border border-[#d8dce6] bg-white px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d] shadow-none hover:bg-[#f4f6fa]"
              >
                <Link to="/baggage/match-review" search={{ match: m.id }}>
                  Review
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {canLink && (
        <>
          <Separator className="bg-[#d8dce6]" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="case-link-bag" className="text-sm font-medium text-[#474950]">
              Link a found bag by hand
            </label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SelectBox
                  id="case-link-bag"
                  value={chosen}
                  onValueChange={setBagId}
                  options={options}
                  placeholder={options.length > 0 ? 'Choose a held bag' : 'No held bags'}
                  disabled={options.length === 0 || busy}
                />
              </div>
              <Button
                type="button"
                disabled={!chosen || busy}
                onClick={() => void link()}
                className="h-auto rounded-lg bg-[#14213d] px-3.5 py-2 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90"
              >
                {busy ? 'Linking…' : 'Link'}
              </Button>
            </div>
          </div>
          <FormError message={error} />
        </>
      )}
    </>
  )
}
