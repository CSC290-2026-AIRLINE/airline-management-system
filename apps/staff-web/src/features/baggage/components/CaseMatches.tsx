import { Label } from '@staff-web/components/ui/label'
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
import { FormError, Pill, SearchSelectBox } from './primitives'

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
      <h3 className="m-0 font-sans text-lg font-semibold text-foreground">Matches</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5">
              <Pill tone={MATCH_LEVEL_TONES[m.level]}>{MATCH_LEVEL_LABELS[m.level]}</Pill>
              <span className="min-w-[8rem] flex-1 text-base break-words text-foreground">
                {bagRef(m.foundBag.id)} at {m.foundBag.currentAirport}
              </span>
              <Pill tone={MATCH_STATUS_TONES[m.status]}>{MATCH_STATUS_LABELS[m.status]}</Pill>
              <Button asChild className="border bg-card shadow-none hover:bg-accent">
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
          <Separator className="bg-border" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-link-bag" className="text-sm font-medium text-foreground">
              Link a found bag by hand
            </Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchSelectBox
                  id="case-link-bag"
                  value={chosen}
                  onValueChange={setBagId}
                  options={options}
                  placeholder={options.length > 0 ? 'Choose a held bag' : 'No held bags'}
                  searchPlaceholder="Search by FB number, colour, type or airport"
                  disabled={options.length === 0 || busy}
                />
              </div>
              <Button type="button" disabled={!chosen || busy} onClick={() => void link()}>
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
