import { MatchDetailCard } from '../components/MatchDetailCard'
import { MatchQueueCard } from '../components/MatchQueueCard'
import { isOpenMatch } from '../constants'
import { useBagMatches } from '../hooks/useBagMatches'

/**
 * Match review (Figma "F10 / Staff / Desktop / 04 Match review — Compare and confirm" and "05 … Owner confirmed"). The
 * selected match lives in the URL so a case's Review button can open it.
 */
export function MatchReviewPage({ selectedId, onSelect }: { selectedId: string | undefined; onSelect: (id: string | undefined) => void }) {
  const matches = useBagMatches()
  const selected = matches.matches.find((m) => m.id === selectedId)
  const toReview = matches.matches.filter((m) => isOpenMatch(m.status)).length

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
          Match review
        </h1>
        <p className="text-lg tracking-[-0.9px] text-[#677287]">
          The system only suggests. Check the details and the booking before a bag moves.
        </p>
      </header>

      <div className="flex items-start gap-6 max-xl:flex-col">
        <div className="min-w-0 flex-1 max-xl:w-full">
          <MatchQueueCard
            matches={matches.matches}
            meta={`${toReview} to review · strong on top`}
            loading={matches.loading}
            error={matches.error}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id === selectedId ? undefined : id)}
          />
        </div>
        <div className="w-[520px] shrink-0 max-xl:w-full">
          <MatchDetailCard
            match={selected}
            loading={matches.loading && !!selectedId}
            onConfirm={matches.confirm}
            onReject={matches.reject}
          />
        </div>
      </div>
    </>
  )
}
