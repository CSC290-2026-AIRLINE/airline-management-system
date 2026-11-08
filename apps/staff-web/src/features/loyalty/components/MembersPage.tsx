import { useCallback, useState, type FormEvent } from 'react'
import type { MemberDetail, StaffLoyaltyApi, TierCode } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatDate, formatMiles, formatTableDate, parseWhole } from '../format'
import { errorMessage, useLoad } from '../use-load'
import { DESKTOP, useMediaQuery } from '../use-media-query'
import { useToast } from '../use-toast'
import { MilesCell, Modal, Segmented, TierPill, Toast, TypePill } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import { cx, ui } from './ui'

const TIER_STAT: Record<TierCode, string> = { silver: ui.statSilver, gold: ui.statGold, platinum: ui.statPlatinum }

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

// S1–S3 Member Lookup: find a member, read their ledger and adjust miles. A mistake is fixed with a new adjustment,
// never by editing a row; every adjustment needs a reason and goes to the audit log.
export function MembersPage() {
  const api = useStaffLoyaltyApi()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const search = useCallback(() => api.searchMembers(query), [api, query])
  const [state, retry] = useLoad(search)
  const [toast, showToast] = useToast()
  const desktop = useMediaQuery(DESKTOP)
  const found = state.status === 'ready' ? state.data : []
  const current = picked && found.some((m) => m.id === picked) ? picked : desktop ? found[0]?.id : undefined
  // Phones show the results or the member, one at a time; desktops show both side by side.
  const showList = desktop || !current

  return (
    <StaffLoyaltyLayout
      title="Member Lookup"
      purpose="Find a loyalty member, see their balance and ledger, and adjust miles with a reason."
      info="Loyalty role only. Every balance adjustment is logged in the audit log (Feature 15)."
    >
      <Toast message={toast} />
      <div className={ui.grid}>
        <section
          className={cx(ui.card, !showList && 'hidden', 'max-lg:border-0 max-lg:bg-transparent max-lg:p-0')}
          aria-labelledby="search"
        >
          <h2 id="search" className={ui.cardTitle} style={{ fontSize: 15 }}>
            Search members
          </h2>
          <div className={ui.searchRow} role="search">
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                className={cx(ui.input, ui.inputSmall, 'pr-10 pl-9 max-lg:min-h-12 max-lg:rounded-xl max-lg:bg-soft max-lg:text-[15px]')}
                placeholder="Member number, name or email"
                aria-label="Member number, name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-[#e5e8ee] text-muted lg:hidden"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <button type="button" className={cx(ui.button, 'max-lg:hidden')} onClick={() => setQuery('')}>
              Clear
            </button>
          </div>
          <Loaded state={state} retry={retry}>
            {(members) =>
              members.length === 0 ? (
                <div className={ui.empty}>
                  <strong>No member matches that search.</strong>
                  <span className={ui.small}>Check the member number, name or email.</span>
                </div>
              ) : (
                <>
                  <span className={ui.small}>
                    {members.length} {desktop ? 'member' : 'result'}
                    {members.length === 1 ? '' : 's'}
                  </span>
                  <ul className={ui.memberList} aria-label="Members found">
                    {members.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-current={current === m.id}
                          onClick={() => setPicked(m.id)}
                          className="max-lg:flex-row! max-lg:items-center max-lg:gap-3! max-lg:rounded-xl! max-lg:px-4! max-lg:py-3.5!"
                        >
                          <span
                            className={cx(
                              'grid size-11 flex-none place-items-center rounded-full text-base font-bold lg:hidden',
                              m.tier?.code === 'gold' ? 'bg-[#fdf0c4] text-[#6b4e00]' : 'bg-[#eef0f3] text-navy',
                            )}
                            aria-hidden="true"
                          >
                            {initialsOf(m.name)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <strong>
                              <span className="truncate">{m.name}</span> <TierPill tier={m.tier} />
                            </strong>
                            <span className={cx(ui.small, 'truncate')}>
                              {desktop ? `${m.email} · ${m.memberNumber}` : `${m.memberNumber} · ${m.email}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )
            }
          </Loaded>
        </section>

        {current ? (
          <MemberPanel key={current} api={api} id={current} onAdjusted={showToast} onBack={desktop ? undefined : () => setPicked(null)} />
        ) : (
          <section className={cx(ui.card, 'max-lg:hidden')}>
            <p className={ui.muted} style={{ textAlign: 'center', padding: '40px 0' }}>
              Pick a member to see their balance and ledger.
            </p>
          </section>
        )}
      </div>
    </StaffLoyaltyLayout>
  )
}

function MemberPanel({
  api,
  id,
  onAdjusted,
  onBack,
}: {
  api: StaffLoyaltyApi
  id: string
  onAdjusted: (toast: string) => void
  onBack?: () => void
}) {
  const load = useCallback(() => api.getMember(id), [api, id])
  const [state, retry] = useLoad(load)
  const [override, setOverride] = useState<MemberDetail | null>(null)
  const [adjusting, setAdjusting] = useState(false)

  return (
    <section className={ui.card} aria-labelledby="member-name">
      {onBack && (
        <button type="button" className={cx(ui.linkButton, 'self-start')} onClick={onBack}>
          ← Back to results
        </button>
      )}
      <Loaded state={state} retry={retry}>
        {(loaded) => {
          const member = override ?? loaded
          const initials = initialsOf(member.name)
          return (
            <>
              <div className={ui.cardHead}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={ui.avatar} aria-hidden="true">
                    {initials}
                  </span>
                  <div>
                    <h2 id="member-name" style={{ fontSize: 17, fontWeight: 700 }}>
                      {member.name}
                    </h2>
                    <span className={ui.small}>{member.memberNumber}</span>
                  </div>
                </div>
                <button type="button" className={cx(ui.buttonPrimary, 'max-sm:w-full')} onClick={() => setAdjusting(true)}>
                  Adjust balance
                </button>
              </div>

              <div className={ui.stats}>
                <Stat label="Miles balance" value={formatMiles(member.milesBalance)} />
                <Stat label="Tier" value={member.tier?.name ?? 'No tier'} tone={member.tier ? TIER_STAT[member.tier.code] : undefined} />
                <Stat label="Tier valid until" value={member.tierExpiresAt ? formatDate(member.tierExpiresAt) : '—'} />
                <Stat label="Customer" value={member.customerId} />
                <Stat label="Email" value={member.email} />
                <Stat label="Joined" value={formatDate(member.joinedAt)} />
              </div>

              <h3 style={{ fontSize: 13, fontWeight: 700 }}>Ledger · newest first</h3>
              <div className={ui.tableBox}>
                <table className={cx(ui.table, ui.tableTall)}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Type</th>
                      <th scope="col" className={ui.num}>
                        Miles
                      </th>
                      <th scope="col" className={ui.num}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.ledger.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div className={ui.empty}>
                            <strong>No transactions yet</strong>
                            <span className={ui.small}>Miles are added after the member’s first flight.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      member.ledger.map((row) => (
                        <tr key={row.seq}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatTableDate(row.occurredAt)}</td>
                          <td>
                            <div>{row.title}</div>
                            <div className={ui.cellSub}>{row.detail}</div>
                          </td>
                          <td>
                            <TypePill type={row.type} />
                          </td>
                          <MilesCell miles={row.miles} />
                          <td className={ui.num}>{formatMiles(row.balanceAfter)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className={ui.small}>
                The ledger can only grow: a mistake is fixed by a new adjustment with a reason, never by editing a row.
              </p>

              {adjusting && (
                <AdjustModal
                  api={api}
                  member={member}
                  onClose={() => setAdjusting(false)}
                  onSaved={(saved, miles) => {
                    setOverride(saved)
                    setAdjusting(false)
                    onAdjusted(
                      `${formatMiles(Math.abs(miles))} miles ${miles > 0 ? 'added to' : 'removed from'} ${saved.name} · logged in Feature 15 audit log`,
                    )
                  }}
                />
              )}
            </>
          )
        }}
      </Loaded>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cx(ui.stat, tone)}>
      <span>{label}</span>
      <strong style={{ overflowWrap: 'anywhere' }}>{value}</strong>
    </div>
  )
}

// P1–P3 Adjust miles.
function AdjustModal({
  api,
  member,
  onClose,
  onSaved,
}: {
  api: StaffLoyaltyApi
  member: MemberDetail
  onClose: () => void
  onSaved: (member: MemberDetail, miles: number) => void
}) {
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [milesText, setMilesText] = useState('')
  const [reason, setReason] = useState('')
  const [reasonMissing, setReasonMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseWhole(milesText)
  const valid = Number.isInteger(amount) && amount > 0
  const miles = direction === 'add' ? amount : -amount
  const after = member.milesBalance + (valid ? miles : 0)
  const belowZero = valid && after < 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (reason.trim() === '') {
      setReasonMissing(true)
      return
    }
    if (!valid || belowZero) return
    setBusy(true)
    try {
      onSaved(await api.adjustMiles(member.id, miles, reason), miles)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Adjust miles" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <p className={ui.muted}>
          {member.name} · {member.memberNumber} · balance {formatMiles(member.milesBalance)} miles
        </p>
        <div className={ui.field}>
          <span className={ui.label}>Change</span>
          <Segmented
            label="Change"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'add', label: 'Add miles' },
              { value: 'remove', label: 'Remove miles' },
            ]}
          />
        </div>
        <label className={ui.field}>
          <span className={ui.label}>Miles</span>
          <input
            className={`${ui.input} ${belowZero ? ui.inputError : ''}`}
            inputMode="numeric"
            value={milesText}
            onChange={(e) => setMilesText(e.target.value)}
            aria-invalid={belowZero}
            aria-describedby="miles-help"
          />
          {belowZero && (
            <span id="miles-help" className={ui.fieldError} role="alert">
              Removing {formatMiles(amount)} would leave −{formatMiles(-after)} miles. The balance can’t go below 0.
            </span>
          )}
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Reason (saved in the audit log)</span>
          <input
            className={`${ui.input} ${reasonMissing ? ui.inputError : ''}`}
            placeholder="Why are you changing this balance?"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonMissing(false)
            }}
            aria-invalid={reasonMissing}
          />
          {reasonMissing && (
            <span className={ui.fieldError} role="alert">
              Required. Adjustments are never applied without a reason.
            </span>
          )}
        </label>
        {valid && !belowZero && (
          <p style={{ fontSize: 13 }}>New balance: {formatMiles(after)} miles. Adjusted miles don’t count toward tiers.</p>
        )}
        {error && (
          <p className={ui.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={ui.modalActions}>
          <button type="button" className={ui.button} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ui.buttonPrimary} disabled={busy || !valid || belowZero}>
            {valid
              ? `${direction === 'add' ? 'Add' : 'Remove'} ${formatMiles(amount)} miles`
              : direction === 'add'
                ? 'Add miles'
                : 'Remove miles'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
