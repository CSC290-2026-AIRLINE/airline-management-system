import { useCallback, useState, type FormEvent } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@staff-web/components/ui/avatar'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { DialogFooter } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import type { MemberDetail, StaffLoyaltyApi } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatDate, formatMiles, formatTableDate, parseWhole } from '../format'
import { errorMessage, useLoad } from '../use-load'
import { DESKTOP, useMediaQuery } from '../use-media-query'
import { Empty, MilesCell, Modal, Segmented, Stat, TierPill, TypePill } from './parts'
import { TIER_TONE } from './tones'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'

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
  const desktop = useMediaQuery(DESKTOP)
  const found = state.status === 'ready' ? state.data : []
  // S0: before a search or a pick, no member is open. After a search, desktops open the first match.
  const starting = query.trim() === ''
  const current = picked && found.some((m) => m.id === picked) ? picked : desktop && !starting ? found[0]?.id : undefined
  // Phones show the results or the member, one at a time; desktops show both side by side.
  const showList = desktop || !current

  return (
    <StaffLoyaltyLayout
      title="Member Lookup"
      purpose="Find a loyalty member, see their balance and ledger, and adjust miles with a reason."
      info="Loyalty role only. Every balance adjustment is logged in the audit log (Feature 15)."
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(300px,30%)_minmax(0,1fr)]">
        <Card className={cn('gap-4', !showList && 'hidden')} aria-labelledby="search">
          <CardHeader>
            <CardTitle id="search">Search members</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2" role="search">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pr-9 pl-9"
                  placeholder="Member number, name or email"
                  aria-label="Member number, name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-0.5 -translate-y-1/2"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>
            <Loaded state={state} retry={retry}>
              {(members) =>
                members.length === 0 ? (
                  <Empty title="No member matches that search.">Check the member number, name or email.</Empty>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {starting
                        ? // An empty search lists the newest members, not this staff member's own lookups.
                          'Newest members'
                        : `${members.length} member${members.length === 1 ? '' : 's'}`}
                    </span>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Members found">
                      {members.map((m) => (
                        <li key={m.id}>
                          <Button
                            variant="outline"
                            aria-current={current === m.id}
                            onClick={() => setPicked(m.id)}
                            className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-left whitespace-normal aria-[current=true]:border-primary/40 aria-[current=true]:bg-accent"
                          >
                            <Avatar className="size-9">
                              <AvatarFallback className={cn('text-xs font-bold', m.tier && TIER_TONE[m.tier.code])}>
                                {initialsOf(m.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex items-center justify-between gap-2 font-semibold">
                                <span className="truncate">{m.name}</span> <TierPill tier={m.tier} />
                              </span>
                              <span className="truncate text-xs font-normal text-muted-foreground">
                                {m.email} · {m.memberNumber}
                              </span>
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </>
                )
              }
            </Loaded>
          </CardContent>
        </Card>

        {current ? (
          <MemberPanel key={current} api={api} id={current} onBack={desktop ? undefined : () => setPicked(null)} />
        ) : (
          <Card className="max-lg:hidden" aria-labelledby="lookup-start">
            <CardContent className="mx-auto flex max-w-[340px] flex-col items-center gap-2 py-10 text-center">
              <span className="mb-2 grid size-16 place-items-center rounded-full bg-accent text-primary" aria-hidden="true">
                <Search className="size-7" />
              </span>
              <h2 id="lookup-start" className="text-base font-semibold">
                Look up a member
              </h2>
              <p className="text-sm text-muted-foreground">
                Search by member number, name or email, or pick a member from the list. Their tier, miles balance and full ledger show here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </StaffLoyaltyLayout>
  )
}

function MemberPanel({ api, id, onBack }: { api: StaffLoyaltyApi; id: string; onBack?: () => void }) {
  const load = useCallback(() => api.getMember(id), [api, id])
  const [state, retry] = useLoad(load)
  const [override, setOverride] = useState<MemberDetail | null>(null)
  const [adjusting, setAdjusting] = useState(false)

  return (
    <Card aria-labelledby="member-name">
      <CardContent className="flex flex-col gap-4">
        {onBack && (
          <Button variant="link" className="self-start px-0" onClick={onBack}>
            <ArrowLeft /> Back to results
          </Button>
        )}
        <Loaded state={state} retry={retry}>
          {(loaded) => {
            const member = override ?? loaded
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-primary text-sm font-bold text-primary-foreground">
                        {initialsOf(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 id="member-name" className="text-lg font-bold">
                        {member.name}
                      </h2>
                      <span className="text-xs text-muted-foreground">{member.memberNumber}</span>
                    </div>
                  </div>
                  <Button className="max-sm:w-full" onClick={() => setAdjusting(true)}>
                    Adjust balance
                  </Button>
                </div>

                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Stat label="Miles balance" value={formatMiles(member.milesBalance)} />
                  <Stat label="Tier" value={member.tier?.name ?? 'No tier'} tone={member.tier ? TIER_TONE[member.tier.code] : undefined} />
                  <Stat label="Tier valid until" value={member.tierExpiresAt ? formatDate(member.tierExpiresAt) : '—'} />
                  <Stat label="Customer" value={member.customerId} />
                  <Stat label="Email" value={member.email} />
                  <Stat label="Joined" value={formatDate(member.joinedAt)} />
                </dl>

                <h3 className="text-sm font-bold">Ledger · newest first</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Miles</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {member.ledger.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <Empty title="No transactions yet">Miles are added after the member’s first flight.</Empty>
                          </TableCell>
                        </TableRow>
                      ) : (
                        member.ledger.map((row) => (
                          <TableRow key={row.seq}>
                            <TableCell>{formatTableDate(row.occurredAt)}</TableCell>
                            <TableCell className="whitespace-normal">
                              <div>{row.title}</div>
                              <div className="text-xs text-muted-foreground">{row.detail}</div>
                            </TableCell>
                            <TableCell>
                              <TypePill type={row.type} />
                            </TableCell>
                            <MilesCell miles={row.miles} />
                            <TableCell className="text-right tabular-nums">{formatMiles(row.balanceAfter)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
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
                      toast.success(
                        `${formatMiles(Math.abs(miles))} miles ${miles > 0 ? 'added to' : 'removed from'} ${saved.name} · logged in Feature 15 audit log`,
                      )
                    }}
                  />
                )}
              </>
            )
          }}
        </Loaded>
      </CardContent>
    </Card>
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
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-muted-foreground">
          {member.name} · {member.memberNumber} · balance {formatMiles(member.milesBalance)} miles
        </p>
        <div className="flex flex-col gap-2">
          <Label>Change</Label>
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="adjust-miles">Miles</Label>
          <Input
            id="adjust-miles"
            inputMode="numeric"
            value={milesText}
            onChange={(e) => setMilesText(e.target.value)}
            aria-invalid={belowZero}
            aria-describedby="miles-help"
          />
          {belowZero && (
            <span id="miles-help" className="text-xs text-destructive" role="alert">
              Removing {formatMiles(amount)} would leave −{formatMiles(-after)} miles. The balance can’t go below 0.
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="adjust-reason">Reason (saved in the audit log)</Label>
          <Input
            id="adjust-reason"
            placeholder="Why are you changing this balance?"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonMissing(false)
            }}
            aria-invalid={reasonMissing}
          />
          {reasonMissing && (
            <span className="text-xs text-destructive" role="alert">
              Required. Adjustments are never applied without a reason.
            </span>
          )}
        </div>
        {valid && !belowZero && (
          <p className="text-sm">New balance: {formatMiles(after)} miles. Adjusted miles don’t count toward tiers.</p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !valid || belowZero}>
            {valid
              ? `${direction === 'add' ? 'Add' : 'Remove'} ${formatMiles(amount)} miles`
              : direction === 'add'
                ? 'Add miles'
                : 'Remove miles'}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  )
}
