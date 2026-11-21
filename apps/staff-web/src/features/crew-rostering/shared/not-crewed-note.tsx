/**
 * The pairings of a run that nobody is on while others are crewed. Assign crew and Fix & publish both print this, so the
 * two pages agree: these pairings raise no breaks, are not published with this batch, and move to a new draft run.
 */
import { NoticeStrip } from '../fix-publish/components/notice-strip'

export interface NotCrewedPairing {
  pairingId: string
  code: string
  /** Set when the base's crew cannot fly it at all, e.g. `Nobody at BKK flies the ATR 72-600.` */
  reason: string | null
}

/** `P-5 and P-8 have nobody on them, so they are not in this round…` plus the distinct reasons. */
function notCrewedText(pairings: readonly NotCrewedPairing[]): string {
  const codes = pairings.map((pairing) => pairing.code)
  const named = codes.length === 1 ? codes[0] : `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`
  const reasons = [...new Set(pairings.map((pairing) => pairing.reason).filter((reason): reason is string => reason !== null))]
  return (
    `${named} ${codes.length === 1 ? 'has' : 'have'} nobody on ${codes.length === 1 ? 'it' : 'them'}, so ${codes.length === 1 ? 'it is' : 'they are'} ` +
    `not part of this round: publishing moves ${codes.length === 1 ? 'it' : 'them'} to a new draft run to crew next.` +
    (reasons.length > 0 ? ` ${reasons.join(' ')}` : '')
  )
}

export function NotCrewedNote({ pairings }: { pairings: readonly NotCrewedPairing[] }) {
  if (pairings.length === 0) return null
  return <NoticeStrip tone="info">{notCrewedText(pairings)}</NoticeStrip>
}
