import { useCallback, useState, type ReactNode } from 'react'
import type { Insurance, LoyaltyRules, LoyaltySettings, StaffLoyaltyApi, TierBenefits, TierCode } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatMiles, parseWhole } from '../format'
import { insuranceLabel, loungeLabel, upgradeLabel, yesNo } from '../labels'
import { errorMessage, useLoad } from '../use-load'
import { useToast } from '../use-toast'
import { Segmented, TierPill, Toast } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import { cx, ui } from './ui'

const AUDIT = 'logged in Feature 15 audit log'

type Section = 'tiers' | 'earn' | 'benefits' | 'settings'

const TABS: { value: Section; label: string }[] = [
  { value: 'tiers', label: 'Tiers' },
  { value: 'earn', label: 'Earning' },
  { value: 'benefits', label: 'Benefits' },
  { value: 'settings', label: 'Settings' },
]

const SETTINGS: { key: keyof LoyaltySettings; label: string; unit: string; usedBy: string }[] = [
  { key: 'milesRetentionMonths', label: 'Miles expire after', unit: 'months', usedBy: 'Expiry job · daily' },
  { key: 'expiryReminderDays', label: 'Reminder before expiry', unit: 'days', usedBy: 'Feature 13 message' },
  { key: 'awardCutoffHours', label: 'Award seats close before departure', unit: 'hours', usedBy: 'Return-to-cash job · Feature 3b' },
]

type BenefitKey = 'priorityCheckIn' | 'priorityBoarding' | 'complimentaryUpgrade'

// Drafts are text, so a half-typed number stays as typed until Save.
interface Drafts {
  tiers: Record<TierCode, [miles: string, flights: string, months: string]>
  earn: Record<string, string>
  benefits: Record<TierCode, TierBenefits>
  baggage: Record<TierCode, string>
  settings: Record<keyof LoyaltySettings, string>
}

function draftsOf(rules: LoyaltyRules): Drafts {
  const byTier = <T,>(f: (code: TierCode) => T) => Object.fromEntries(rules.tiers.map((t) => [t.code, f(t.code)])) as Record<TierCode, T>
  return {
    tiers: byTier((c) => {
      const t = rules.tiers.find((x) => x.code === c)!
      return [formatMiles(t.minMiles), String(t.minFlights), String(t.validMonths)]
    }),
    earn: Object.fromEntries(rules.earnRules.map((r) => [r.fareClassId, r.multiplier])),
    benefits: structuredClone(rules.benefits),
    baggage: byTier((c) => String(rules.benefits[c].bonusBaggageKg)),
    settings: {
      milesRetentionMonths: String(rules.settings.milesRetentionMonths),
      expiryReminderDays: String(rules.settings.expiryReminderDays),
      awardCutoffHours: String(rules.settings.awardCutoffHours),
    },
  }
}

// S4–S6 Loyalty Rules: tier thresholds, miles multipliers per fare class, tier benefits and programme settings.
// Tiers come with the migration; staff edit their numbers but cannot add or delete one.
export function RulesPage() {
  const api = useStaffLoyaltyApi()
  const load = useCallback(() => api.getRules(), [api])
  const [state, reload] = useLoad(load)

  return (
    <StaffLoyaltyLayout
      title="Loyalty Rules"
      purpose="Tier thresholds, miles multipliers by fare class, tier benefits and expiry settings."
      info="Rule changes apply to new activity only. Past ledger rows are never recalculated. Every saved change is written to the audit log (Feature 15)."
    >
      <Loaded state={state} retry={reload}>
        {(rules) => <Rules api={api} initial={rules} />}
      </Loaded>
    </StaffLoyaltyLayout>
  )
}

function Rules({ api, initial }: { api: StaffLoyaltyApi; initial: LoyaltyRules }) {
  const [rules, setRules] = useState(initial)
  const [editing, setEditing] = useState<Section | null>(null)
  const [draft, setDraft] = useState<Drafts>(() => draftsOf(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Section>('tiers')
  const [toast, showToast] = useToast()

  const start = (section: Section) => {
    setDraft(draftsOf(rules))
    setEditing(section)
    setError(null)
  }
  const cancel = () => {
    setEditing(null)
    setError(null)
  }

  // The API saves one row at a time, so a card saves the rows that changed, in order.
  const save = async (section: Section) => {
    setBusy(true)
    setError(null)
    try {
      let next = rules
      let message: string
      switch (section) {
        case 'tiers':
          for (const t of rules.tiers) {
            const [m, f, v] = draft.tiers[t.code]
            const patch = { minMiles: parseWhole(m), minFlights: parseWhole(f), validMonths: parseWhole(v) }
            if (patch.minMiles === t.minMiles && patch.minFlights === t.minFlights && patch.validMonths === t.validMonths) continue
            const saved = await api.updateTier(t.code, patch)
            next = { ...next, tiers: next.tiers.map((x) => (x.code === t.code ? saved : x)) }
          }
          message = 'Tier rules saved'
          break
        case 'earn':
          for (const r of rules.earnRules) {
            const value = draft.earn[r.fareClassId].trim()
            if (value === r.multiplier) continue
            const saved = await api.setEarnMultiplier(r.fareClassId, value)
            next = { ...next, earnRules: next.earnRules.map((x) => (x.fareClassId === r.fareClassId ? saved : x)) }
          }
          message = 'Earning multipliers saved'
          break
        case 'benefits':
          for (const t of rules.tiers) {
            const value = { ...draft.benefits[t.code], bonusBaggageKg: Number(draft.baggage[t.code].replace(/[^\d.]/g, '')) }
            if (JSON.stringify(value) === JSON.stringify(rules.benefits[t.code])) continue
            const saved = await api.updateTierBenefits(t.code, value)
            next = { ...next, benefits: { ...next.benefits, [t.code]: saved } }
          }
          message = 'Tier benefits saved'
          break
        case 'settings': {
          const settings = {
            milesRetentionMonths: parseWhole(draft.settings.milesRetentionMonths),
            expiryReminderDays: parseWhole(draft.settings.expiryReminderDays),
            awardCutoffHours: parseWhole(draft.settings.awardCutoffHours),
          }
          next = { ...next, settings: await api.updateSettings(settings) }
          message = 'Settings saved'
          break
        }
        default: {
          const unreachable: never = section
          throw new Error(unreachable)
        }
      }
      setRules(next)
      setEditing(null)
      showToast(`${message} · ${AUDIT}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const input = (value: string, onChange: (v: string) => void, label: string, width = 'w-24') => (
    <input
      className={cx(ui.input, ui.inputSmall, width)}
      inputMode="decimal"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )

  const card = (section: Section, title: string, children: ReactNode, footnote?: ReactNode, subtitle?: string) => (
    <EditableCard
      key={section}
      title={title}
      subtitle={subtitle}
      editing={editing === section}
      locked={editing !== null && editing !== section}
      hiddenOnPhone={tab !== section}
      busy={busy}
      error={editing === section ? error : null}
      onEdit={() => start(section)}
      onCancel={cancel}
      onSave={() => void save(section)}
      footnote={footnote}
    >
      {children}
    </EditableCard>
  )

  const setTier = (code: TierCode, i: number, v: string) =>
    setDraft({
      ...draft,
      tiers: { ...draft.tiers, [code]: draft.tiers[code].map((x, j) => (j === i ? v : x)) as Drafts['tiers'][TierCode] },
    })
  const setBenefit = (code: TierCode, patch: Partial<TierBenefits>) =>
    setDraft({ ...draft, benefits: { ...draft.benefits, [code]: { ...draft.benefits[code], ...patch } } })

  const tiersEditing = editing === 'tiers'
  const tierCard = card(
    'tiers',
    'Tier rules',
    <>
      {/* Phones: one card per tier */}
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 lg:hidden">
        {rules.tiers.map((t) => (
          <li key={t.code} className="flex flex-col gap-3 rounded-xl border border-f11-field px-4 py-3.5">
            <TierPill tier={t} />
            <div className="grid grid-cols-3 gap-2">
              {(['Miles needed', 'Or flights', 'Valid'] as const).map((label, i) => (
                <div key={label} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-f11-muted">{label}</span>
                  {tiersEditing ? (
                    input(draft.tiers[t.code][i], (v) => setTier(t.code, i, v), `${t.name} ${label}`, 'w-full')
                  ) : (
                    <strong className="text-lg font-bold">
                      {[formatMiles(t.minMiles), String(t.minFlights), `${t.validMonths} months`][i]}
                    </strong>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <table className={cx(ui.table, ui.tableTall, 'max-lg:hidden')}>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Miles needed</th>
            <th scope="col">Or flights</th>
            <th scope="col">Valid (months)</th>
          </tr>
        </thead>
        <tbody>
          {rules.tiers.map((t) => (
            <tr key={t.code}>
              <td>
                <TierPill tier={t} />
              </td>
              <td className={ui.strong}>
                {tiersEditing
                  ? input(draft.tiers[t.code][0], (v) => setTier(t.code, 0, v), `${t.name} miles needed`)
                  : formatMiles(t.minMiles)}
              </td>
              <td>
                {tiersEditing ? input(draft.tiers[t.code][1], (v) => setTier(t.code, 1, v), `${t.name} flights`, 'w-16') : t.minFlights}
              </td>
              <td>
                {tiersEditing ? input(draft.tiers[t.code][2], (v) => setTier(t.code, 2, v), `${t.name} months`, 'w-24') : t.validMonths}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>,
    undefined,
    'Miles or flights in the rolling 12 months. Only flights the member flew personally count.',
  )

  const earnCard = card(
    'earn',
    'Earning multipliers',
    <table className={cx(ui.table, 'min-w-0!')}>
      <thead>
        <tr>
          <th scope="col">Fare class</th>
          <th scope="col">Code</th>
          <th scope="col">Multiplier</th>
        </tr>
      </thead>
      <tbody>
        {rules.earnRules.map((r) => (
          <tr key={r.fareClassId}>
            <td>{r.fareClassName}</td>
            <td>{r.fareClassCode}</td>
            <td className={ui.strong}>
              {editing === 'earn'
                ? input(
                    draft.earn[r.fareClassId],
                    (v) => setDraft({ ...draft, earn: { ...draft.earn, [r.fareClassId]: v } }),
                    `${r.fareClassName} multiplier`,
                    'w-20',
                  )
                : `× ${r.multiplier}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>,
    earnExample(rules),
  )

  const benefitsEditing = editing === 'benefits'
  const memberPrice = Object.values(rules.benefits).find((x) => x.insurance.kind === 'member_price')?.insurance
  const priceThb = memberPrice?.kind === 'member_price' ? memberPrice.priceThb : 190
  const yesNoSelect = (code: TierCode, key: BenefitKey, label: string) => (
    <select
      className={cx(ui.input, ui.inputSmall, 'w-full max-w-[180px]')}
      aria-label={`${label} · ${code}`}
      value={draft.benefits[code][key] ? 'yes' : 'no'}
      onChange={(e) => setBenefit(code, { [key]: e.target.value === 'yes' })}
    >
      <option value="yes">
        {key === 'complimentaryUpgrade'
          ? upgradeLabel(code, rules.tiers, { ...draft.benefits, [code]: { ...draft.benefits[code], complimentaryUpgrade: true } })
          : 'Yes'}
      </option>
      <option value="no">No</option>
    </select>
  )
  const benefitRows: { name: string; view: (c: TierCode) => string; edit: (c: TierCode) => ReactNode }[] = [
    {
      name: 'Lounge access',
      view: (c) => loungeLabel(rules.benefits[c].loungeGuests),
      edit: (c) => (
        <select
          className={cx(ui.input, ui.inputSmall, 'w-full max-w-[180px]')}
          aria-label={`Lounge access · ${c}`}
          value={draft.benefits[c].loungeGuests ?? 'none'}
          onChange={(e) => setBenefit(c, { loungeGuests: e.target.value === 'none' ? null : Number(e.target.value) })}
        >
          <option value="none">No access</option>
          {[0, 1, 2].map((n) => (
            <option key={n} value={n}>
              {loungeLabel(n)}
            </option>
          ))}
        </select>
      ),
    },
    {
      name: 'Extra free baggage',
      view: (c) => `+${rules.benefits[c].bonusBaggageKg} kg`,
      edit: (c) =>
        input(
          draft.baggage[c],
          (v) => setDraft({ ...draft, baggage: { ...draft.baggage, [c]: v } }),
          `Extra baggage kg · ${c}`,
          'w-full max-w-[180px]',
        ),
    },
    {
      name: 'Priority check-in lane',
      view: (c) => yesNo(rules.benefits[c].priorityCheckIn),
      edit: (c) => yesNoSelect(c, 'priorityCheckIn', 'Priority check-in'),
    },
    {
      name: 'Priority boarding',
      view: (c) => yesNo(rules.benefits[c].priorityBoarding),
      edit: (c) => yesNoSelect(c, 'priorityBoarding', 'Priority boarding'),
    },
    {
      name: 'Complimentary upgrade',
      view: (c) => upgradeLabel(c, rules.tiers, rules.benefits),
      edit: (c) => yesNoSelect(c, 'complimentaryUpgrade', 'Complimentary upgrade'),
    },
    {
      name: 'Travel insurance',
      view: (c) => insuranceLabel(rules.benefits[c].insurance),
      edit: (c) => (
        <select
          className={cx(ui.input, ui.inputSmall, 'w-full max-w-[180px]')}
          aria-label={`Travel insurance · ${c}`}
          value={draft.benefits[c].insurance.kind}
          onChange={(e) => {
            const kind = e.target.value as Insurance['kind']
            setBenefit(c, { insurance: kind === 'member_price' ? { kind, priceThb } : { kind } })
          }}
        >
          <option value="none">Not offered</option>
          <option value="included">Included</option>
          <option value="member_price">THB {priceThb} member price</option>
        </select>
      ),
    },
  ]
  const benefitsCard = card(
    'benefits',
    'Tier benefits',
    <div className={ui.tableWrap}>
      <table className={cx(ui.table, benefitsEditing && '[&_td]:py-1.5')}>
        <thead>
          <tr>
            <th scope="col">Benefit</th>
            {rules.tiers.map((t) => (
              <th key={t.code} scope="col">
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {benefitRows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              {rules.tiers.map((t) => (
                <td key={t.code}>{benefitsEditing ? row.edit(t.code) : row.view(t.code)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    benefitsEditing ? undefined : 'Features 6 and 12 read these the next time a benefit is used.',
  )

  const settingsCard = card(
    'settings',
    'Settings',
    <div className={ui.tableWrap}>
      <table className={ui.table}>
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Value</th>
            <th scope="col">Used by</th>
          </tr>
        </thead>
        <tbody>
          {SETTINGS.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td className={ui.strong}>
                {editing === 'settings' ? (
                  <span className="inline-flex items-center gap-2">
                    {input(
                      draft.settings[s.key],
                      (v) => setDraft({ ...draft, settings: { ...draft.settings, [s.key]: v } }),
                      `${s.label} (${s.unit})`,
                      'w-20',
                    )}
                    <span className={ui.muted}>{s.unit}</span>
                  </span>
                ) : (
                  `${rules.settings[s.key]} ${s.unit}`
                )}
              </td>
              <td>{s.usedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  )

  return (
    <>
      <Toast message={toast} />
      <div className="lg:hidden">
        <Segmented
          label="Rules section"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ ...t, disabled: editing !== null && editing !== t.value }))}
        />
      </div>
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {tierCard}
        {earnCard}
      </div>
      {benefitsCard}
      {settingsCard}
    </>
  )
}

function EditableCard({
  title,
  subtitle,
  editing,
  locked,
  hiddenOnPhone,
  busy,
  error,
  onEdit,
  onCancel,
  onSave,
  footnote,
  children,
}: {
  title: string
  subtitle?: string
  editing: boolean
  locked: boolean
  hiddenOnPhone: boolean
  busy: boolean
  error: string | null
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  footnote?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cx(ui.card, editing && ui.cardEditing, hiddenOnPhone && 'max-lg:hidden')} aria-label={title}>
      <div className={ui.cardHead}>
        <div className="flex flex-col gap-0.5">
          <h2 className={cx(ui.cardTitle, 'text-lg')}>{title}</h2>
          {subtitle && <span className={cx(ui.small, 'lg:hidden')}>{subtitle}</span>}
        </div>
        {!editing && (
          <button
            type="button"
            className={cx(
              ui.linkButton,
              'max-lg:rounded-full max-lg:border max-lg:border-[#f3dca4] max-lg:bg-[#fff6dc] max-lg:px-4 max-lg:py-2 max-lg:text-f11-warn max-lg:hover:no-underline',
            )}
            onClick={onEdit}
            disabled={locked}
          >
            <span className="lg:hidden" aria-hidden="true">
              ✎{' '}
            </span>
            Edit
          </button>
        )}
      </div>
      {children}
      {footnote && <p className={ui.small}>{footnote}</p>}
      {editing && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cx(error ? ui.fieldError : ui.small, 'm-0 text-xs!')} role={error ? 'alert' : undefined}>
            {error ?? 'Applies to new activity only. Saved changes go to the audit log.'}
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:flex">
            <button type="button" className={ui.button} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={ui.buttonPrimary} onClick={onSave} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// e.g. "Example: BKK → HKG is 1,722 km, so Business earns 2,583 miles."
function earnExample(rules: LoyaltyRules) {
  const best = [...rules.earnRules].sort((a, b) => Number(b.multiplier) - Number(a.multiplier))[0]
  if (!best) return ''
  return `Example: BKK → HKG is 1,722 km, so ${best.fareClassName} earns ${formatMiles(Math.round(1722 * Number(best.multiplier)))} miles.`
}
