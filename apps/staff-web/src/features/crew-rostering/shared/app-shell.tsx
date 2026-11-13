/**
 * Page chrome shared by the crew-rostering pages: roster run badge, the three-step
 * wizard strip, tabs and the unsaved-changes bar.
 *
 * The sidebar is not here: every crew page sits inside the global staff `AppShell`
 * (admin-console), wired once by the `_crew` layout route.
 */
import { formatDateRange } from '../build-pairings/types/format'
import { Button, CheckIcon } from './ui'

export type WizardStep = 'build-pairings' | 'assign-crew' | 'fix-publish'

const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'build-pairings', label: 'Build pairings' },
  { id: 'assign-crew', label: 'Assign crew' },
  { id: 'fix-publish', label: 'Fix & publish' },
]

/** Pill in the page header, e.g. `ROSTER RUN  BKK · 15–19 Sep 2026  Draft`. */
export function RosterRunBadge({ base, dateFrom, dateTo, status }: { base: string; dateFrom: string; dateTo: string; status: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border-desc/50 bg-white py-1.5 pr-1.5 pl-3.5">
      <span className="text-[10px] font-semibold tracking-wider text-primary-text/55 uppercase">Roster run</span>
      <span className="text-[13px] font-bold text-primary-text">
        {base} · {formatDateRange(dateFrom, dateTo)}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          status === 'Published' ? 'bg-valid-bg text-valid' : 'bg-gold/15 text-primary-text'
        }`}
      >
        {status}
      </span>
      <span className="px-1 text-[11px] text-border-desc">▾</span>
    </div>
  )
}

/**
 * Three-step wizard strip. Status only: it shows how far the run has got and is not clickable.
 *
 * From `sm` the current step is a navy block holding its number and label. On a phone the
 * labels sit under the numbers and the current number is ringed instead, because the
 * block would not fit three steps across.
 */
export function WizardSteps({ active, allDone = false }: { active: WizardStep; allDone?: boolean }) {
  const activeIndex = WIZARD_STEPS.findIndex((step) => step.id === active)
  return (
    <div className="flex items-start justify-center gap-1 rounded-2xl bg-band-bg px-3 py-3 sm:items-center sm:justify-start sm:gap-3 sm:px-3 sm:py-2">
      {WIZARD_STEPS.map((step, index) => {
        const done = allDone || index < activeIndex
        const current = !allDone && index === activeIndex
        return (
          <div key={step.id} className="flex items-start gap-1 sm:items-center sm:gap-3">
            {index > 0 && <span aria-hidden="true" className="mt-4 h-0.5 w-9 shrink-0 rounded-full bg-border-desc/70 sm:mt-0 sm:w-6" />}
            <div
              aria-current={current ? 'step' : undefined}
              className={`flex w-20 flex-col items-center gap-1.5 sm:w-auto sm:flex-row sm:gap-2.5 sm:rounded-xl sm:py-2 sm:pr-4 sm:pl-3.5 ${
                current ? 'sm:bg-btn-navy' : ''
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:h-5.5 sm:w-5.5 sm:text-[11px] ${
                  current
                    ? 'border-2 border-primary bg-white text-primary sm:border-0 sm:text-btn-navy'
                    : done
                      ? 'bg-valid text-white'
                      : 'border border-border-desc bg-white text-primary-text/55'
                }`}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`text-center text-xs sm:hidden ${current ? 'font-bold text-primary' : 'font-semibold text-primary/55'}`}>
                {SHORT_LABELS[step.id]}
              </span>
              <span
                className={`hidden text-sm whitespace-nowrap sm:inline ${
                  current ? 'font-bold text-white' : done ? 'font-semibold text-primary-text' : 'font-semibold text-primary/55'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Short step labels for small screens, where the full labels would wrap. */
const SHORT_LABELS: Record<WizardStep, string> = {
  'build-pairings': 'Build',
  'assign-crew': 'Assign',
  'fix-publish': 'Fix & publish',
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

/**
 * Two-tab strip under a page heading. `tabs` is generic so a page keeps its own
 * union of tab ids instead of widening this to `string`.
 *
 * The active tab is underlined in `primary`: the mockups show a blue rule, but
 * `ui-style.md` is the palette of record and carries no blue, and navy is the
 * colour the same mockups use for every other active marker.
 */
export function TabsNav<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div role="tablist" className="flex border-b border-border-desc/40">
      {tabs.map((tab) => {
        const current = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current}
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex-1 border-b-2 px-4 py-3 text-sm font-semibold transition-colors sm:flex-none sm:px-8 ${
              current ? 'border-primary text-primary' : 'border-transparent text-primary-text/55 hover:text-primary-text'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unsaved-changes bar
// ---------------------------------------------------------------------------

/**
 * Strip that appears once a page has pending edits.
 *
 * `sticky bottom-4` rather than a fixed bar: it reads as a normal block when the
 * content is short, and stays reachable at the foot of the column when the page
 * scrolls. Actions go full width below `md`, per `ui-style.md`.
 */
export function BottomUnsavedBar({
  summary,
  saveLabel,
  onDiscard,
  onSave,
}: {
  summary: string
  saveLabel: string
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-primary/15 bg-info-bg px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <p className="text-sm text-primary-text/75">{summary}</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button variant="outline" onClick={onDiscard} fullWidth>
          Discard
        </Button>
        <Button variant="primary" onClick={onSave} fullWidth>
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
