import { useCallback, useState, type ReactNode } from 'react'
import type { Insurance, LoyaltyRules, LoyaltySettings, StaffLoyaltyApi, TierBenefits, TierCode } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatMiles, parseWhole } from '../format'
import { insuranceLabel, loungeLabel, upgradeLabel, yesNo } from '../labels'
import { errorMessage, useLoad } from '../use-load'
import { useToast } from '../use-toast'
import { Modal, Segmented, TierPill, Toast } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import { ui } from './ui'

const AUDIT = 'logged in Feature 15 audit log'

type Editing = { kind: 'tier'; code: TierCode } | { kind: 'earn'; id: string } | { kind: 'setting'; key: keyof LoyaltySettings } | null

const SETTINGS: { key: keyof LoyaltySettings; label: string; unit: string; usedBy: string; saved: string }[] = [
  { key: 'milesRetentionMonths', label: 'Miles expire after', unit: 'months', usedBy: 'Expiry job · daily', saved: 'Miles expiry' },
  { key: 'expiryReminderDays', label: 'Reminder before expiry', unit: 'days', usedBy: 'Feature 13 message', saved: 'Expiry reminder' },
  {
    key: 'awardCutoffHours',
    label: 'Award seats close before departure',
    unit: 'hours',
    usedBy: 'Return-to-cash job · Feature 3b',
    saved: 'Award cutoff',
  },
]

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
  const [editing, setEditing] = useState<Editing>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [benefitsFor, setBenefitsFor] = useState<TierCode | null>(null)
  const [toast, showToast] = useToast()

  const start = (next: NonNullable<Editing>, values: (string | number)[]) => {
    setEditing(next)
    setDraft(values.map(String))
    setError(null)
  }
  const cancel = () => {
    setEditing(null)
    setError(null)
  }
  const save = async (action: () => Promise<LoyaltyRules>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      setRules(await action())
      setEditing(null)
      showToast(`${message} · ${AUDIT}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const isEditing = (e: NonNullable<Editing>) => JSON.stringify(e) === JSON.stringify(editing)
  const input = (i: number, label: string) => (
    <input
      className={`${ui.input} ${ui.inputSmall}`}
      inputMode="decimal"
      aria-label={label}
      value={draft[i] ?? ''}
      onChange={(e) => setDraft(draft.map((v, j) => (j === i ? e.target.value : v)))}
    />
  )
  const actions = (onSave: () => void, onEdit: () => void, editingRow: boolean) =>
    editingRow ? (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className={ui.button} onClick={cancel}>
          Cancel
        </button>
        <button type="button" className={ui.buttonPrimary} onClick={onSave} disabled={busy}>
          Save
        </button>
      </div>
    ) : (
      <button type="button" className={ui.button} onClick={onEdit} disabled={editing !== null}>
        Edit
      </button>
    )

  const editingTier = editing?.kind === 'tier' ? rules.tiers.find((t) => t.code === editing.code) : undefined

  return (
    <>
      <Toast message={toast} />

      <Card
        title="Tier rules"
        note="A member reaches a tier with either enough miles or enough flights in the rolling 12 months. Only flights the member flew personally count."
      >
        <table className={`${ui.table} ${ui.tableTall}`}>
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">Miles needed</th>
              <th scope="col">Or flights</th>
              <th scope="col">Valid (months)</th>
              <th scope="col">
                <span className={ui.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.tiers.map((t) => {
              const row = isEditing({ kind: 'tier', code: t.code })
              return (
                <tr key={t.code}>
                  <td>
                    <TierPill tier={t} />
                  </td>
                  <td className={ui.strong}>{row ? input(0, `${t.name} miles needed`) : formatMiles(t.minMiles)}</td>
                  <td>{row ? input(1, `${t.name} flights`) : t.minFlights}</td>
                  <td>{row ? input(2, `${t.name} validity in months`) : t.validMonths}</td>
                  <td className={ui.num}>
                    {actions(
                      () =>
                        void save(async () => {
                          const tier = await api.updateTier(t.code, {
                            minMiles: parseWhole(draft[0]),
                            minFlights: parseWhole(draft[1]),
                            validMonths: parseWhole(draft[2]),
                          })
                          return { ...rules, tiers: rules.tiers.map((x) => (x.code === t.code ? tier : x)) }
                        }, `${t.name} rule saved`),
                      () => start({ kind: 'tier', code: t.code }, [formatMiles(t.minMiles), t.minFlights, t.validMonths]),
                      row,
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {editingTier && (
          <p className={error ? ui.fieldError : ui.warn} role={error ? 'alert' : undefined}>
            {error ?? `Saving changes ${editingTier.name} for every member at their next tier check. Members keep a tier until it expires.`}
          </p>
        )}
      </Card>

      <Card
        title="Earning multipliers"
        note="Miles earned = route distance in km × the multiplier for the fare class, rounded. A multiplier of 0 earns nothing."
      >
        <table className={`${ui.table} ${ui.tableTall}`}>
          <thead>
            <tr>
              <th scope="col">Fare class</th>
              <th scope="col">Code</th>
              <th scope="col">Multiplier</th>
              <th scope="col">
                <span className={ui.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.earnRules.map((r) => {
              const row = isEditing({ kind: 'earn', id: r.fareClassId })
              return (
                <tr key={r.fareClassId}>
                  <td>{r.fareClassName}</td>
                  <td>{r.fareClassCode}</td>
                  <td className={ui.strong}>{row ? input(0, `${r.fareClassName} multiplier`) : `× ${r.multiplier}`}</td>
                  <td className={ui.num}>
                    {actions(
                      () =>
                        void save(async () => {
                          const saved = await api.setEarnMultiplier(r.fareClassId, draft[0].trim())
                          return { ...rules, earnRules: rules.earnRules.map((x) => (x.fareClassId === r.fareClassId ? saved : x)) }
                        }, `${r.fareClassName} multiplier saved`),
                      () => start({ kind: 'earn', id: r.fareClassId }, [r.multiplier]),
                      row,
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {editing?.kind === 'earn' && error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <p className={ui.small}>{earnExample(rules)}</p>
      </Card>

      <Card
        title="Tier benefits"
        action={
          <button type="button" className={ui.button} onClick={() => setBenefitsFor('gold')} disabled={editing !== null}>
            Edit benefits
          </button>
        }
      >
        <table className={ui.table}>
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
            {(
              [
                ['Lounge access', (c: TierCode) => loungeLabel(rules.benefits[c].loungeGuests)],
                ['Extra free baggage', (c: TierCode) => `+${rules.benefits[c].bonusBaggageKg} kg`],
                ['Priority check-in lane', (c: TierCode) => yesNo(rules.benefits[c].priorityCheckIn)],
                ['Priority boarding', (c: TierCode) => yesNo(rules.benefits[c].priorityBoarding)],
                ['Complimentary upgrade', (c: TierCode) => upgradeLabel(c, rules.tiers, rules.benefits)],
                ['Travel insurance', (c: TierCode) => insuranceLabel(rules.benefits[c].insurance)],
              ] as const
            ).map(([name, value]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {rules.tiers.map((t) => (
                  <td key={t.code}>{value(t.code)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Settings">
        <table className={`${ui.table} ${ui.tableTall}`}>
          <thead>
            <tr>
              <th scope="col">Setting</th>
              <th scope="col">Value</th>
              <th scope="col">Used by</th>
              <th scope="col">
                <span className={ui.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {SETTINGS.map((s) => {
              const row = isEditing({ kind: 'setting', key: s.key })
              return (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td className={ui.strong}>{row ? input(0, `${s.label} (${s.unit})`) : `${rules.settings[s.key]} ${s.unit}`}</td>
                  <td>{s.usedBy}</td>
                  <td className={ui.num}>
                    {actions(
                      () =>
                        void save(async () => {
                          const settings = await api.updateSettings({ ...rules.settings, [s.key]: parseWhole(draft[0]) })
                          return { ...rules, settings }
                        }, `${s.saved} saved`),
                      () => start({ kind: 'setting', key: s.key }, [rules.settings[s.key]]),
                      row,
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {editing?.kind === 'setting' && error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
      </Card>

      {benefitsFor && (
        <BenefitsModal
          api={api}
          rules={rules}
          initialTier={benefitsFor}
          onClose={() => setBenefitsFor(null)}
          onSaved={(code, saved) => {
            setRules({ ...rules, benefits: { ...rules.benefits, [code]: saved } })
            setBenefitsFor(null)
            showToast(`${rules.tiers.find((t) => t.code === code)?.name} benefits saved · ${AUDIT}`)
          }}
        />
      )}
    </>
  )
}

function Card({ title, note, action, children }: { title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={ui.card} aria-label={title}>
      <div className={ui.cardHead}>
        <h2 className={ui.cardTitle}>{title}</h2>
        {action}
      </div>
      {note && (
        <p className={ui.muted} style={{ fontSize: 12, marginTop: -6 }}>
          {note}
        </p>
      )}
      <div className={ui.tableWrap}>{children}</div>
    </section>
  )
}

// e.g. "Example: BKK → HKG is 1,722 km, so Business earns 2,583 miles."
function earnExample(rules: LoyaltyRules) {
  const best = [...rules.earnRules].sort((a, b) => Number(b.multiplier) - Number(a.multiplier))[0]
  if (!best) return ''
  return `Example: BKK → HKG is 1,722 km, so ${best.fareClassName} earns ${formatMiles(Math.round(1722 * Number(best.multiplier)))} miles.`
}

type InsuranceChoice = Insurance['kind']

// P7 Edit tier benefits.
function BenefitsModal({
  api,
  rules,
  initialTier,
  onClose,
  onSaved,
}: {
  api: StaffLoyaltyApi
  rules: LoyaltyRules
  initialTier: TierCode
  onClose: () => void
  onSaved: (code: TierCode, benefits: TierBenefits) => void
}) {
  const [code, setCode] = useState(initialTier)
  const [values, setValues] = useState(rules.benefits)
  const [baggage, setBaggage] = useState<Record<TierCode, string>>({
    silver: String(rules.benefits.silver.bonusBaggageKg),
    gold: String(rules.benefits.gold.bonusBaggageKg),
    platinum: String(rules.benefits.platinum.bonusBaggageKg),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const b = values[code]
  const tierName = rules.tiers.find((t) => t.code === code)?.name ?? ''
  const memberPrice = Object.values(rules.benefits).find((x) => x.insurance.kind === 'member_price')?.insurance
  const priceThb = memberPrice?.kind === 'member_price' ? memberPrice.priceThb : 190

  const set = (patch: Partial<TierBenefits>) => setValues({ ...values, [code]: { ...b, ...patch } })

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      onSaved(code, await api.updateTierBenefits(code, { ...b, bonusBaggageKg: Number(baggage[code]) }))
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const toggle = (label: string, key: 'priorityCheckIn' | 'priorityBoarding' | 'complimentaryUpgrade') => (
    <div className={ui.toggleRow}>
      <span>{label}</span>
      <Segmented
        label={label}
        value={b[key] ? 'yes' : 'no'}
        onChange={(v) => set({ [key]: v === 'yes' })}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
      />
    </div>
  )

  return (
    <Modal title="Edit tier benefits" onClose={onClose}>
      <p className={ui.muted} style={{ fontSize: 12 }}>
        Changes are saved through Feature 15 and written to the audit log. Features 6 and 12 read them the next time a benefit is used.
      </p>
      <div className={ui.field}>
        <span className={ui.label}>Tier</span>
        <Segmented label="Tier" value={code} onChange={setCode} options={rules.tiers.map((t) => ({ value: t.code, label: t.name }))} />
      </div>
      <label className={ui.field}>
        <span className={ui.label}>Lounge access</span>
        <select
          className={ui.input}
          value={b.loungeGuests ?? 'none'}
          onChange={(e) => set({ loungeGuests: e.target.value === 'none' ? null : Number(e.target.value) })}
        >
          <option value="none">No access</option>
          {[0, 1, 2].map((n) => (
            <option key={n} value={n}>
              {loungeLabel(n)}
            </option>
          ))}
        </select>
        <span className={ui.small}>Member only, or the member plus up to 2 guests.</span>
      </label>
      <label className={ui.field}>
        <span className={ui.label}>Extra free baggage (kg)</span>
        <input
          className={ui.input}
          inputMode="decimal"
          value={baggage[code]}
          onChange={(e) => setBaggage({ ...baggage, [code]: e.target.value })}
        />
        <span className={ui.small}>Feature 6 adds this to the free allowance.</span>
      </label>
      {toggle('Priority check-in lane', 'priorityCheckIn')}
      {toggle('Priority boarding', 'priorityBoarding')}
      {toggle('Complimentary upgrade', 'complimentaryUpgrade')}
      <label className={ui.field}>
        <span className={ui.label}>Travel insurance</span>
        <select
          className={ui.input}
          value={b.insurance.kind}
          onChange={(e) => {
            const kind = e.target.value as InsuranceChoice
            set({ insurance: kind === 'member_price' ? { kind, priceThb } : { kind } })
          }}
        >
          <option value="none">Not offered</option>
          <option value="included">Included</option>
          <option value="member_price">Member price · THB {priceThb}</option>
        </select>
        <span className={ui.small}>Not offered, Included, or a member price paid by card.</span>
      </label>
      {error && (
        <p className={ui.fieldError} role="alert">
          {error}
        </p>
      )}
      <div className={ui.modalActions}>
        <button type="button" className={ui.button} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={ui.buttonPrimary} onClick={() => void submit()} disabled={busy}>
          Save {tierName} benefits
        </button>
      </div>
    </Modal>
  )
}
