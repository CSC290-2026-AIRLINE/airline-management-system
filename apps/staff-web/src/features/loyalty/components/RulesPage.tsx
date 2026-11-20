import { useCallback, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import type { Insurance, LoyaltyRules, LoyaltySettings, StaffLoyaltyApi, TierBenefits, TierCode } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatMiles, parseWhole } from '../format'
import { insuranceLabel, loungeLabel, upgradeLabel, yesNo } from '../labels'
import { errorMessage, useLoad } from '../use-load'
import { Segmented, TierPill } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'

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
      toast.success(`${message}. New activity uses the new values. · ${AUDIT}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const input = (value: string, onChange: (v: string) => void, label: string, width = 'w-24') => (
    <Input className={cn('h-8', width)} inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
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
          <li key={t.code} className="flex flex-col gap-3 rounded-lg border px-4 py-3.5">
            <TierPill tier={t} />
            <div className="grid grid-cols-3 gap-2">
              {(['Miles needed', 'Or flights', 'Valid'] as const).map((label, i) => (
                <div key={label} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
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
      <Table className="max-lg:hidden">
        <TableHeader>
          <TableRow>
            <TableHead>Tier</TableHead>
            <TableHead>Miles needed</TableHead>
            <TableHead>Or flights</TableHead>
            <TableHead>Valid (months)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.tiers.map((t) => (
            <TableRow key={t.code}>
              <TableCell>
                <TierPill tier={t} />
              </TableCell>
              <TableCell className="font-semibold">
                {tiersEditing
                  ? input(draft.tiers[t.code][0], (v) => setTier(t.code, 0, v), `${t.name} miles needed`)
                  : formatMiles(t.minMiles)}
              </TableCell>
              <TableCell>
                {tiersEditing ? input(draft.tiers[t.code][1], (v) => setTier(t.code, 1, v), `${t.name} flights`, 'w-16') : t.minFlights}
              </TableCell>
              <TableCell>
                {tiersEditing ? input(draft.tiers[t.code][2], (v) => setTier(t.code, 2, v), `${t.name} months`, 'w-24') : t.validMonths}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>,
    undefined,
    'Miles or flights in the rolling 12 months. Only flights the member flew personally count.',
  )

  const earnCard = card(
    'earn',
    'Earning multipliers',
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fare class</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Multiplier</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.earnRules.map((r) => (
          <TableRow key={r.fareClassId}>
            <TableCell>{r.fareClassName}</TableCell>
            <TableCell>{r.fareClassCode}</TableCell>
            <TableCell className="font-semibold">
              {editing === 'earn'
                ? input(
                    draft.earn[r.fareClassId],
                    (v) => setDraft({ ...draft, earn: { ...draft.earn, [r.fareClassId]: v } }),
                    `${r.fareClassName} multiplier`,
                    'w-20',
                  )
                : `× ${r.multiplier}`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>,
    earnExample(rules),
  )

  const benefitsEditing = editing === 'benefits'
  const memberPrice = Object.values(rules.benefits).find((x) => x.insurance.kind === 'member_price')?.insurance
  const priceThb = memberPrice?.kind === 'member_price' ? memberPrice.priceThb : 190
  const yesNoSelect = (code: TierCode, key: BenefitKey, label: string) => (
    <NativeSelect
      size="sm"
      className="w-full min-w-44 max-w-[240px]"
      aria-label={`${label} · ${code}`}
      value={draft.benefits[code][key] ? 'yes' : 'no'}
      onChange={(e) => setBenefit(code, { [key]: e.target.value === 'yes' })}
    >
      <NativeSelectOption value="yes">
        {key === 'complimentaryUpgrade'
          ? upgradeLabel(code, rules.tiers, { ...draft.benefits, [code]: { ...draft.benefits[code], complimentaryUpgrade: true } })
          : 'Yes'}
      </NativeSelectOption>
      <NativeSelectOption value="no">No</NativeSelectOption>
    </NativeSelect>
  )
  const benefitRows: { name: string; view: (c: TierCode) => string; edit: (c: TierCode) => ReactNode }[] = [
    {
      name: 'Lounge access',
      view: (c) => loungeLabel(rules.benefits[c].loungeGuests),
      edit: (c) => (
        <NativeSelect
          size="sm"
          className="w-full min-w-44 max-w-[240px]"
          aria-label={`Lounge access · ${c}`}
          value={draft.benefits[c].loungeGuests === null ? 'none' : String(draft.benefits[c].loungeGuests)}
          onChange={(e) => setBenefit(c, { loungeGuests: e.target.value === 'none' ? null : Number(e.target.value) })}
        >
          <NativeSelectOption value="none">No access</NativeSelectOption>
          {[0, 1, 2].map((n) => (
            <NativeSelectOption key={n} value={String(n)}>
              {loungeLabel(n)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
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
          'w-full min-w-44 max-w-[240px]',
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
        <NativeSelect
          size="sm"
          className="w-full min-w-44 max-w-[240px]"
          aria-label={`Travel insurance · ${c}`}
          value={draft.benefits[c].insurance.kind}
          onChange={(e) => {
            const kind = e.target.value as Insurance['kind']
            setBenefit(c, { insurance: kind === 'member_price' ? { kind, priceThb } : { kind } })
          }}
        >
          <NativeSelectOption value="none">Not offered</NativeSelectOption>
          <NativeSelectOption value="included">Included</NativeSelectOption>
          <NativeSelectOption value="member_price">THB {priceThb} member price</NativeSelectOption>
        </NativeSelect>
      ),
    },
  ]
  const benefitsCard = card(
    'benefits',
    'Tier benefits',
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Benefit</TableHead>
          {rules.tiers.map((t) => (
            <TableHead key={t.code}>{t.name}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {benefitRows.map((row) => (
          <TableRow key={row.name}>
            <TableHead scope="row" className="font-semibold text-foreground">
              {row.name}
            </TableHead>
            {rules.tiers.map((t) => (
              <TableCell key={t.code}>{benefitsEditing ? row.edit(t.code) : row.view(t.code)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>,
    benefitsEditing ? undefined : 'Features 6 and 12 read these the next time a benefit is used.',
  )

  const settingsCard = card(
    'settings',
    'Settings',
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Setting</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Used by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SETTINGS.map((s) => (
          <TableRow key={s.key}>
            <TableCell>{s.label}</TableCell>
            <TableCell className="font-semibold">
              {editing === 'settings' ? (
                <span className="inline-flex items-center gap-2">
                  {input(
                    draft.settings[s.key],
                    (v) => setDraft({ ...draft, settings: { ...draft.settings, [s.key]: v } }),
                    `${s.label} (${s.unit})`,
                    'w-20',
                  )}
                  <span className="font-normal text-muted-foreground">{s.unit}</span>
                </span>
              ) : (
                `${rules.settings[s.key]} ${s.unit}`
              )}
            </TableCell>
            <TableCell>{s.usedBy}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>,
  )

  return (
    <>
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
    <Card className={cn(editing && 'border-primary ring-3 ring-primary/10', hiddenOnPhone && 'max-lg:hidden')} aria-label={title}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {subtitle && <CardDescription className="lg:hidden">{subtitle}</CardDescription>}
        {!editing && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onEdit} disabled={locked}>
              <Pencil /> Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
      {editing && (
        <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn('m-0 text-xs', error ? 'text-destructive' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
            {error ?? 'Applies to new activity only. Saved changes go to the audit log.'}
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:flex">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )
}

// e.g. "Example: BKK → HKG is 1,722 km, so Business earns 2,583 miles."
function earnExample(rules: LoyaltyRules) {
  const best = [...rules.earnRules].sort((a, b) => Number(b.multiplier) - Number(a.multiplier))[0]
  if (!best) return ''
  return `Example: BKK → HKG is 1,722 km, so ${best.fareClassName} earns ${formatMiles(Math.round(1722 * Number(best.multiplier)))} miles.`
}
