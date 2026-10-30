import { useCallback, useState, type FormEvent } from 'react'
import type { MemberDetail, StaffLoyaltyApi } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatDate, formatMiles, formatTableDate, parseWhole } from '../format'
import { errorMessage, useLoad } from '../use-load'
import { useToast } from '../use-toast'
import { MilesCell, Modal, Segmented, TierPill, Toast, TypePill } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import styles from './loyalty.module.css'

// S1–S3 Member Lookup: find a member, read their ledger and adjust miles. A mistake is fixed with a new adjustment,
// never by editing a row; every adjustment needs a reason and goes to the audit log.
export function MembersPage() {
  const api = useStaffLoyaltyApi()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const search = useCallback(() => api.searchMembers(query), [api, query])
  const [state, retry] = useLoad(search)
  const [toast, showToast] = useToast()

  return (
    <StaffLoyaltyLayout
      title="Member Lookup"
      purpose="Find a loyalty member, see their balance and ledger, and adjust miles with a reason."
      info="Loyalty role only. Every balance adjustment is logged in the audit log (Feature 15)."
    >
      <Toast message={toast} />
      <div className={styles.grid2}>
        <section className={styles.card} aria-labelledby="search">
          <h2 id="search" className={styles.cardTitle} style={{ fontSize: 14 }}>
            Search members
          </h2>
          <div className={styles.searchRow} role="search">
            <input
              className={`${styles.input} ${styles.inputSmall}`}
              placeholder="Member number, name or email"
              aria-label="Member number, name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className={styles.button} onClick={() => setQuery('')}>
              Clear
            </button>
          </div>
          <Loaded state={state} retry={retry}>
            {(members) =>
              members.length === 0 ? (
                <div className={styles.empty}>
                  <strong>No member matches that search.</strong>
                  <span className={styles.small}>Check the member number, name or email.</span>
                </div>
              ) : (
                <>
                  <span className={styles.small}>
                    {members.length} member{members.length === 1 ? '' : 's'}
                  </span>
                  <ul className={styles.memberList} aria-label="Members found">
                    {members.map((m) => (
                      <li key={m.id}>
                        <button type="button" aria-current={(picked ?? members[0].id) === m.id} onClick={() => setPicked(m.id)}>
                          <strong>
                            {m.name} <TierPill tier={m.tier} />
                          </strong>
                          <span className={styles.small}>
                            {m.email} · {m.memberNumber}
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

        {state.status === 'ready' && state.data.length > 0 ? (
          <MemberPanel
            key={picked && state.data.some((m) => m.id === picked) ? picked : state.data[0].id}
            api={api}
            id={picked && state.data.some((m) => m.id === picked) ? picked : state.data[0].id}
            onAdjusted={showToast}
          />
        ) : (
          <section className={styles.card}>
            <p className={styles.muted} style={{ textAlign: 'center', padding: '40px 0' }}>
              Pick a member to see their balance and ledger.
            </p>
          </section>
        )}
      </div>
    </StaffLoyaltyLayout>
  )
}

function MemberPanel({ api, id, onAdjusted }: { api: StaffLoyaltyApi; id: string; onAdjusted: (toast: string) => void }) {
  const load = useCallback(() => api.getMember(id), [api, id])
  const [state, retry] = useLoad(load)
  const [override, setOverride] = useState<MemberDetail | null>(null)
  const [adjusting, setAdjusting] = useState(false)

  return (
    <section className={styles.card} aria-labelledby="member-name">
      <Loaded state={state} retry={retry}>
        {(loaded) => {
          const member = override ?? loaded
          const initials = member.name
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
          return (
            <>
              <div className={styles.cardHead}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={styles.avatar} aria-hidden="true">
                    {initials}
                  </span>
                  <div>
                    <h2 id="member-name" style={{ fontSize: 17, fontWeight: 700 }}>
                      {member.name}
                    </h2>
                    <span className={styles.small}>{member.memberNumber}</span>
                  </div>
                </div>
                <button type="button" className={styles.buttonPrimary} onClick={() => setAdjusting(true)}>
                  Adjust balance
                </button>
              </div>

              <div className={styles.stats}>
                <Stat label="Miles balance" value={formatMiles(member.milesBalance)} />
                <Stat label="Tier" value={member.tier?.name ?? 'No tier'} />
                <Stat label="Tier valid until" value={member.tierExpiresAt ? formatDate(member.tierExpiresAt) : '—'} />
                <Stat label="Customer" value={member.customerId} />
                <Stat label="Email" value={member.email} />
                <Stat label="Joined" value={formatDate(member.joinedAt)} />
              </div>

              <h3 style={{ fontSize: 13, fontWeight: 700 }}>Ledger · newest first</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Type</th>
                      <th scope="col" className={styles.num}>
                        Miles
                      </th>
                      <th scope="col" className={styles.num}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.ledger.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div className={styles.empty}>
                            <strong>No transactions yet</strong>
                            <span className={styles.small}>Miles are added after the member’s first flight.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      member.ledger.map((row) => (
                        <tr key={row.seq}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatTableDate(row.occurredAt)}</td>
                          <td>
                            <div>{row.title}</div>
                            <div className={styles.cellSub}>{row.detail}</div>
                          </td>
                          <td>
                            <TypePill type={row.type} />
                          </td>
                          <MilesCell miles={row.miles} />
                          <td className={styles.num}>{formatMiles(row.balanceAfter)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className={styles.small}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
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
        <p className={styles.muted}>
          {member.name} · {member.memberNumber} · balance {formatMiles(member.milesBalance)} miles
        </p>
        <div className={styles.field}>
          <span className={styles.label}>Change</span>
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
        <label className={styles.field}>
          <span className={styles.label}>Miles</span>
          <input
            className={`${styles.input} ${belowZero ? styles.inputError : ''}`}
            inputMode="numeric"
            value={milesText}
            onChange={(e) => setMilesText(e.target.value)}
            aria-invalid={belowZero}
            aria-describedby="miles-help"
          />
          {belowZero && (
            <span id="miles-help" className={styles.fieldError} role="alert">
              Removing {formatMiles(amount)} would leave −{formatMiles(-after)} miles. The balance can’t go below 0.
            </span>
          )}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Reason (saved in the audit log)</span>
          <input
            className={`${styles.input} ${reasonMissing ? styles.inputError : ''}`}
            placeholder="Why are you changing this balance?"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonMissing(false)
            }}
            aria-invalid={reasonMissing}
          />
          {reasonMissing && (
            <span className={styles.fieldError} role="alert">
              Required. Adjustments are never applied without a reason.
            </span>
          )}
        </label>
        {valid && !belowZero && (
          <p style={{ fontSize: 13 }}>New balance: {formatMiles(after)} miles. Adjusted miles don’t count toward tiers.</p>
        )}
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.buttonPrimary} disabled={busy || !valid || belowZero}>
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
