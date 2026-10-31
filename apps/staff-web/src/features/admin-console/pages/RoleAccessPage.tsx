import { useMemo, useState } from 'react'
import { Eye, X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { cn } from '@staff-web/lib/utils'
import { useListScreens } from '../api/screens'
import { useListRoles, useGetRoleScreens, useReplaceRoleScreens } from '../api/roles'
import { useStaffApi } from '../api/staff'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { ScreenDto, StaffRow } from '../types'

/* Helpers --------------------------------------------------------------- */

/** Radix `Select` items cannot have an empty value, so "nobody picked" gets its own sentinel. */
/** Mirrors `MIN_REASON_LENGTH` in the backend's `ReplaceRoleScreensDto` — the same number, checked on both sides. */
const MIN_REASON_LENGTH = 10

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function setsDiff(a: Set<string>, b: Set<string>): { added: string[]; removed: string[] } {
  const added: string[] = []
  const removed: string[] = []
  for (const v of a) if (!b.has(v)) added.push(v)
  for (const v of b) if (!a.has(v)) removed.push(v)
  return { added, removed }
}

/** Look for a numeric HTTP status in a thrown error message — `401 Unauthorized: {…}` from the API wrapper. */
function statusFromError(msg: string): number | undefined {
  const m = /(\b\d{3}\b)/.exec(msg)
  if (!m) return undefined
  const n = Number(m[1])
  return n >= 100 && n < 600 ? n : undefined
}

/** `5` or `05` → `F5 PAYMENTS`, as the group headers in the design read. A feature with no label shows its number only. */
function featureTitle(featureNo: string): string {
  const no = featureNo.replace(/^0+(?=\d)/, '')
  const label = featureLabel(featureNo)
  return label.startsWith('FEATURE ') ? `F${no}` : `F${no} ${label}`
}

/** One card in the matrix: a header bar plus its screen rows. */
interface DisplayGroup {
  key: string
  title: string
  /** Set when every screen in the group is `admin` — the header then carries the lock note. */
  locked: boolean
  screens: ScreenDto[]
}

/**
 * Core screens are lifted into their own "CORE (EVERYONE)" group ahead of the per-feature groups, matching the design.
 * Feature groups follow in the order the API returned them.
 */
function buildGroups(groups: { feature_no: string; screens: ScreenDto[] }[]): DisplayGroup[] {
  const coreScreens: ScreenDto[] = []
  const byFeature = new Map<string, ScreenDto[]>()
  for (const g of groups) {
    for (const s of g.screens) {
      if (s.kind === 'core') {
        coreScreens.push(s)
        continue
      }
      const list = byFeature.get(g.feature_no) ?? []
      list.push(s)
      byFeature.set(g.feature_no, list)
    }
  }

  const out: DisplayGroup[] = []
  if (coreScreens.length > 0) {
    out.push({ key: 'core', title: 'CORE (EVERYONE)', locked: true, screens: coreScreens })
  }
  for (const [featureNo, screens] of byFeature) {
    out.push({
      key: featureNo,
      title: featureTitle(featureNo),
      locked: screens.every((s) => s.kind === 'admin'),
      screens,
    })
  }
  return out
}

/**
 * Split the groups across two explicit columns rather than using CSS multi-column, so each column can carry its own
 * "Can see / Screen / Note" header. The split is by group count — left gets the extra group when the total is odd.
 */
function splitColumns(groups: DisplayGroup[]): DisplayGroup[][] {
  const half = Math.ceil(groups.length / 2)
  return [groups.slice(0, half), groups.slice(half)]
}

/* Shared class lists ------------------------------------------------------ */

const CARD = 'gap-0 rounded-[14px] border-[#d9dfe9] bg-white font-sans leading-[normal] text-ink shadow-none'
const BTN = 'h-[42px] rounded-[9px] px-4 text-sm font-semibold shadow-none'
const BTN_OUTLINE = cn(BTN, 'border-[#d9dfe9] bg-white text-ink hover:bg-accent')
const BTN_PRIMARY = cn(BTN, 'bg-primary text-white hover:bg-[#1c2a48]')
const FIELD =
  'h-12 w-full rounded-[9px] border-[#d9dfe9] bg-white px-3.5 text-[15px] text-ink shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 md:text-[15px]'
/** The design's 22px checkbox: navy when granted, grey when the screen is locked on, white when off. */
function ScreenCheck({ checked, locked }: { checked: boolean; locked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[22px] shrink-0 items-center justify-center rounded-sm border text-white',
        checked ? (locked ? 'border-[#c5cdd9] bg-[#c5cdd9]' : 'border-ink bg-ink') : 'border-[#c5cdd9] bg-white',
      )}
    >
      {checked && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      )}
    </span>
  )
}

const LOCKED_TIP = 'Core and Admin screens can’t be given or taken away (SCREEN_NOT_ASSIGNABLE)'

/** What the save panel under the card is showing. */
type Panel = { kind: 'idle' } | { kind: 'saved'; reason: string; previous: string[]; staffCount: number }

/* Component ------------------------------------------------------------- */

/**
 * Role access page. Checking a box marks the row "Unsaved" and opens the Save changes panel under the card; saving
 * PUTs the whole grant set for the selected role and the backend writes the audit row in the same transaction. After a
 * save the panel turns green and offers Undo, which puts the previous set back as unsaved changes (it still needs a
 * reason to save).
 *
 * Both access gates live in `routes/_authenticated/admin/route.tsx`, one level up: it owns `RequireStaff` (one
 * `GET /api/me/screens` for all three tabs). Do not add another gate in here.
 */
export function RoleAccessPage() {
  const listScreens = useListScreens()
  const listRoles = useListRoles()
  const getRoleScreens = useGetRoleScreens()
  const replaceRoleScreens = useReplaceRoleScreens()
  const staffApi = useStaffApi()

  /* Role selection. The first role is picked once the roles load — see the render-time adjustment below. */
  const [roleId, setRoleId] = useState<string | null>(null)

  /* Edit state — pending = null means "no unsaved changes" */
  const [pending, setPending] = useState<Set<string> | null>(null)
  const [reason, setReason] = useState('')
  /** Set when Save was pressed without a long-enough reason: the panel turns red until the reason is fixed. */
  const [reasonMissing, setReasonMissing] = useState(false)

  /* "Preview as user" dialog — the staff list is fetched when it opens, not with the page. */
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewStaff, setPreviewStaff] = useState<StaffRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>({ kind: 'idle' })

  const registry = useRoleAccess(roleId, listScreens, listRoles, getRoleScreens)
  const groups = useMemo(() => buildGroups(registry.screens), [registry.screens])
  const columns = useMemo(() => splitColumns(groups), [groups])

  const dirty = pending !== null && !setsEqual(pending, registry.granted)
  const diff = useMemo(() => {
    if (pending === null) return { added: [], removed: [] }
    return setsDiff(registry.granted, pending)
  }, [pending, registry.granted])
  const changeCount = diff.added.length + diff.removed.length

  /* The backend rejects a shorter reason with a 400 (`MIN_REASON_LENGTH` in the DTO). Mirror it here so the panel can
     say so before a request that can only fail. */
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH

  /* Pick first role once roles load — render-time adjustment. */
  if (roleId === null && !registry.loading && registry.roles.length > 0) {
    setRoleId(registry.roles[0].id)
  }

  const currentRole = registry.roles.find((r) => r.id === roleId) ?? null

  /** Whether a screen shows as ticked: core for everyone, admin screens for an admin role, the rest by grant. */
  function shownChecked(s: ScreenDto, granted: Set<string>): boolean {
    if (s.kind === 'core') return true
    if (s.kind === 'admin') return !!currentRole?.is_admin
    return granted.has(s.id)
  }

  /* Reset the edit state. Shared by undo, role switch, and a successful save. */
  function resetEdits() {
    setPending(null)
    setReason('')
    setReasonMissing(false)
    setSaveError(null)
  }

  function selectRole(newRoleId: string | null) {
    setRoleId(newRoleId)
    resetEdits()
    setPanel({ kind: 'idle' })
  }

  function toggle(screenId: string, kind: ScreenDto['kind']) {
    if (kind !== 'assignable' || !roleId) return
    const base = pending ?? new Set(registry.granted)
    const next = new Set(base)
    if (next.has(screenId)) next.delete(screenId)
    else next.add(screenId)
    setPending(next)
    // A "Saved" or a failed-save message no longer describes what is on screen once a box moves.
    setSaveError(null)
    setPanel({ kind: 'idle' })
  }

  /** After a save, Undo brings the previous set back as unsaved changes — reverting is a change too, with its own reason. */
  function undoSaved(previous: string[]) {
    setPanel({ kind: 'idle' })
    setPending(new Set(previous))
    setReason('')
    setReasonMissing(false)
  }

  /* Open the "Preview as user" dialog and fetch the staff list for it. The list is loaded here rather than with the
     page: most admins never open it, and `GET /api/admin/staff` is admin-only and not cheap. */
  async function openPreview() {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const list = await staffApi.list()
      setPreviewStaff(list.staff)
      const first = list.staff.find((s) => s.role.id === roleId)
      setPreviewStaffId((id) => (id && list.staff.some((s) => s.id === id && s.role.id === roleId) ? id : (first?.id ?? null)))
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  /* What a staff member with this role can actually open, mirroring the policy `GET /api/me/screens` applies on the
     server: core screens for everyone, admin screens for an `is_admin` role, assignable screens only with a grant.
     Saved grants only — the dialog says unsaved changes are not included. */
  const previewSees = useMemo(() => {
    const role = currentRole
    if (!role) return []
    return registry.screens.flatMap((g) =>
      g.screens.filter((s) => (s.kind === 'core' ? true : s.kind === 'admin' ? role.is_admin : registry.granted.has(s.id))),
    )
  }, [currentRole, registry.granted, registry.screens])

  /* Save — the whole grant set goes to the server; there is no per-screen PATCH. */
  async function save() {
    if (!roleId || !pending || saving) return
    if (!reasonOk) {
      setReasonMissing(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    const previous = [...registry.granted]
    const savedReason = reason.trim()
    try {
      const res = await replaceRoleScreens(roleId, { screen_ids: [...pending], reason: savedReason })
      // Take the server's set rather than our own: it is de-duplicated and sorted.
      registry.setGranted(res.role_id, res.screen_ids)
      resetEdits()
      setPanel({ kind: 'saved', reason: savedReason, previous, staffCount: currentRole?.staff_count ?? 0 })
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /* Render ------------------------------------------------------------ */

  /* A user with no staff row never reaches this point — the layout route answers that case first. */

  if (registry.loading) return <p className="text-sm text-muted-foreground">Loading role access…</p>
  if (registry.error) {
    /* A signed-in non-admin gets 403 from AdminConsoleGuard. That is an authorization answer, not a broken setup,
       so it renders the shared access-denied card rather than the setup checklist. */
    if (statusFromError(registry.error) === 403) {
      return <NoAccessScreen screenName="Role access" homeTo="/" />
    }
    return (
      <AdminErrorCard
        page="Role access"
        error={registry.error}
        status={statusFromError(registry.error)}
        onRetry={() => window.location.reload()}
      />
    )
  }

  const granted = pending ?? registry.granted
  const previewCandidates = previewStaff.filter((s) => s.role.id === currentRole?.id)
  const previewPerson = previewCandidates.find((s) => s.id === previewStaffId) ?? null
  const roleCount = (
    <>
      {currentRole?.staff_count ?? 0} staff with this role · {changeCount} unsaved change{changeCount === 1 ? '' : 's'}
    </>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <Card className={cn(CARD, 'px-[27px] pt-[27px] pb-6 max-tablet:px-[15px] max-tablet:pt-[15px]')}>
        {/* Header row --------------------------------------------------- */}
        <div className="flex items-start gap-4 max-tablet:flex-col max-tablet:gap-3">
          <div className="min-w-0 flex-auto max-tablet:flex max-tablet:w-full max-tablet:items-start max-tablet:justify-between max-tablet:gap-3">
            <div>
              <h2 className="m-0 font-sans text-xl leading-[normal] font-bold tracking-[-1px] text-ink max-tablet:text-[22px] max-tablet:tracking-[-0.5px]">
                Screens for {currentRole?.name ?? '—'}
              </h2>
              <p className="mt-2 max-w-[540px] text-sm text-muted-foreground max-tablet:hidden">
                Pick which screens each role can see. Screen access only: what a screen allows is set by its own feature.
              </p>
            </div>
            <p className="hidden shrink-0 text-right text-[11px] font-semibold text-muted-foreground max-tablet:block max-tablet:max-w-[130px]">
              {roleCount}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className={cn(
              BTN_OUTLINE,
              'mt-[19px] h-[43px] gap-2 border-[#cbd5e1] rounded-lg max-tablet:mt-0 max-tablet:w-full max-tablet:h-[45px]',
            )}
            onClick={() => void openPreview()}
          >
            <Eye className="size-4" aria-hidden="true" />
            Preview as user
          </Button>
          <p className="hidden text-xs text-muted-foreground max-tablet:block">
            Pick which screens each role can see. Screen access only: what a screen allows is set by its own feature.
          </p>

          <div className="flex w-[218px] shrink-0 flex-col max-tablet:w-full">
            <label className="mb-[3px] text-xs font-semibold text-muted-foreground max-tablet:uppercase" htmlFor="role-select">
              Role
            </label>
            <Select value={roleId ?? undefined} onValueChange={(v) => selectRole(v || null)}>
              <SelectTrigger id="role-select" className={cn(FIELD, 'data-[size=default]:h-12')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-xl border-[#d9dfe9] font-sans leading-[normal]">
                {registry.roles.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="h-10 text-[15px]">
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 self-end text-right text-xs font-semibold whitespace-nowrap text-[#bf6a02] max-tablet:hidden">{roleCount}</p>
          </div>
        </div>

        {/* Screen matrix ----------------------------------------------- */}
        {registry.screens.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-[#d1d5db] bg-white p-8 text-center">
            <h3 className="mb-2 text-base font-semibold text-ink">No screens registered yet</h3>
            <p className="text-sm text-muted-foreground">
              Features self-register their screens via{' '}
              <code className="rounded-sm bg-[#f3f4f6] px-1.5 py-px font-mono text-xs">POST /api/admin/screens</code>. As soon as feature
              teams register theirs, they will appear here grouped by feature.
            </p>
          </div>
        ) : (
          <div className="mt-[22px] grid grid-cols-2 items-start gap-[62px] max-wide:grid-cols-1 max-wide:gap-2.5 max-tablet:mt-4">
            {columns.map((column, ci) => (
              <div className="flex min-w-0 flex-col gap-2.5" key={ci}>
                {/* Column headers sit once at the top of each column. In one column (≤1100px) the second copy would
                    repeat mid-list, so it is hidden there; the phone design has none. */}
                <div
                  className={cn(
                    'grid grid-cols-[70px_minmax(0,1fr)_auto] text-[11px] font-semibold text-muted-foreground max-tablet:hidden',
                    ci > 0 && 'max-wide:hidden',
                  )}
                  aria-hidden="true"
                >
                  <span>CAN SEE</span>
                  <span>SCREEN</span>
                  <span className="pr-1.5">NOTE</span>
                </div>

                {column.map((group) => (
                  <section key={group.key} aria-label={group.title}>
                    <header className="bg-muted py-2.5 pl-3 text-xs font-semibold text-ink uppercase">
                      {group.title}
                      {group.locked && group.key !== 'core' && ' · Admin only — locked'}
                    </header>
                    <ul>
                      {group.screens.map((s) => {
                        const locked = s.kind !== 'assignable'
                        const checked = shownChecked(s, granted)
                        const unsaved = !locked && pending !== null && checked !== registry.granted.has(s.id)
                        const row = (
                          <li
                            key={s.id}
                            className={cn(
                              'flex h-[50px] items-center gap-5 border-b border-[#d9dfe9] pr-1.5 pl-[18px] text-[15px] text-ink max-tablet:h-10 max-tablet:gap-3 max-tablet:border-0 max-tablet:pl-0 max-tablet:text-[13px]',
                              locked ? 'cursor-default hover:bg-[#f7f9fc]' : 'cursor-pointer hover:bg-[#f7f9fc]',
                            )}
                            onClick={() => toggle(s.id, s.kind)}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              aria-disabled={locked || !roleId}
                              aria-label={s.name}
                              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggle(s.id, s.kind)
                              }}
                            >
                              <ScreenCheck checked={checked} locked={locked} />
                            </button>
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            {s.kind === 'core' && (
                              <span className="flex h-[26px] w-[82px] shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                                Core
                              </span>
                            )}
                            {unsaved && (
                              <span className="flex h-[26px] w-[82px] shrink-0 items-center justify-center rounded-full bg-warning-soft text-[11px] font-semibold text-warning">
                                Unsaved
                              </span>
                            )}
                          </li>
                        )
                        if (!locked) return row
                        return (
                          <Tooltip key={s.id}>
                            <TooltipTrigger asChild>{row}</TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="rounded-md bg-ink px-2 py-1.5 font-sans text-[11px] leading-[normal] font-semibold text-white [&>svg]:hidden"
                            >
                              {LOCKED_TIP}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Save changes panel ------------------------------------------ */}
      {roleId && dirty && (
        <Card
          className={cn(
            CARD,
            'mt-5 border-[#d9dfe9] bg-[#fff4de] px-[27px] pt-6 pb-6 max-tablet:px-[15px]',
            reasonMissing && 'border-[#757575]',
          )}
          role="region"
          aria-label="Save changes"
        >
          <h3 className={cn('m-0 text-[22px] font-bold text-warning', reasonMissing && 'text-[#ba212e]')}>
            {reasonMissing ? 'Add a reason before saving access.' : 'Save changes'}
          </h3>
          <label
            htmlFor="access-reason"
            className={cn('mt-2 mb-[3px] text-[13px] font-semibold text-muted-foreground', reasonMissing && 'sr-only')}
          >
            Reason (saved in the audit log)
          </label>
          <Input
            id="access-reason"
            className={cn(FIELD, 'text-sm md:text-sm', reasonMissing && 'mt-[22px] border-[#e34236] focus-visible:border-[#e34236]')}
            aria-invalid={reasonMissing || undefined}
            placeholder={`Why is this changing? (at least ${MIN_REASON_LENGTH} characters)`}
            value={reason}
            maxLength={500}
            onChange={(e) => {
              setReason(e.target.value)
              if (reasonMissing && e.target.value.trim().length >= MIN_REASON_LENGTH) setReasonMissing(false)
            }}
          />
          {saveError && (
            <p className="mt-3 rounded-[9px] bg-danger-soft px-4 py-2.5 text-sm text-danger" role="alert">
              {saveError}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-[11px] max-phone:mt-4">
            <Button
              type="button"
              variant="outline"
              className={cn(BTN_OUTLINE, 'w-[135px] max-phone:flex-1')}
              onClick={resetEdits}
              disabled={saving}
            >
              Undo changes
            </Button>
            <Button type="button" className={cn(BTN_PRIMARY, 'w-[140px] max-phone:flex-1')} onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save access'}
            </Button>
          </div>
        </Card>
      )}

      {/* Saved -------------------------------------------------------- */}
      {roleId && !dirty && panel.kind === 'saved' && (
        <Card className={cn(CARD, 'mt-5 border-[#087338] bg-[#f0fbf4] px-[27px] pt-[17px] pb-6 max-tablet:px-[15px]')} role="status">
          <p className="text-ink">
            <span className="text-[22px] font-bold">Saved. </span>
            <span className="text-[15px] font-medium italic">
              Applies to {panel.staffCount} staff with this role in their next page load.
            </span>
          </p>
          <label htmlFor="saved-reason" className="mt-1.5 mb-[5px] text-[13px] font-semibold text-muted-foreground">
            Reason (saved in the audit log)
          </label>
          <Input id="saved-reason" className={cn(FIELD, 'text-sm md:text-sm')} value={panel.reason} readOnly />
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              className={cn(BTN, 'w-[135px] bg-navy text-[#f8fafc] hover:bg-[#1c2a48]')}
              onClick={() => undoSaved(panel.previous)}
            >
              Undo changes
            </Button>
          </div>
        </Card>
      )}

      <p className="mt-[18px] text-xs text-muted-foreground">Core and Admin screens are locked; only assignable screens can change.</p>

      {/* Preview as user --------------------------------------------- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex w-[520px] max-w-[calc(100%-32px)] flex-col gap-3.5 rounded-2xl border-0 bg-white p-6 font-sans leading-[normal] text-ink shadow-[0_16px_40px_rgba(10,20,41,0.2)] sm:max-w-[calc(100%-32px)]"
        >
          <header className="flex items-center gap-2">
            <DialogTitle className="flex-1 text-[22px] leading-[normal] font-bold text-ink">Preview as user</DialogTitle>
            <button type="button" className="text-[#677287] hover:text-ink" onClick={() => setPreviewOpen(false)} aria-label="Close">
              <X className="size-5" />
            </button>
          </header>
          <DialogDescription className="text-[13px] text-[#677287]">
            See exactly the menu a staff member gets. It follows their role.
          </DialogDescription>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink" htmlFor="preview-staff">
              Staff member
            </label>
            {previewError ? (
              <p className="text-[13px] text-danger">Could not load the staff list — {previewError}</p>
            ) : previewLoading ? (
              <p className="text-[13px] text-[#677287]">Loading staff…</p>
            ) : previewCandidates.length === 0 ? (
              <p className="text-[13px] text-[#677287]">Nobody has the {currentRole?.name} role yet.</p>
            ) : (
              <Select value={previewStaffId ?? undefined} onValueChange={setPreviewStaffId}>
                <SelectTrigger
                  id="preview-staff"
                  className="h-auto w-full rounded-lg border-[#cbd5e1] bg-white px-3.5 py-3 text-sm font-medium text-ink shadow-none data-[size=default]:h-auto"
                >
                  <SelectValue placeholder="Choose a staff member" />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans leading-[normal]">
                  {previewCandidates.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} · {s.role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto rounded-xl bg-navy px-3.5 py-4">
            <p className="text-[10px] font-semibold text-[#9fb3d9] uppercase">
              {previewPerson ? `${previewPerson.first_name} ${previewPerson.last_name}` : (currentRole?.name ?? 'This role')} sees
            </p>
            {previewSees.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-white/70">No screens yet.</p>
            ) : (
              previewSees.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md px-2.5 py-2">
                  <span className="text-sm font-medium text-white">{s.name}</span>
                  <span className="flex-1" />
                  {s.kind === 'core' && <span className="text-[10px] font-semibold text-[#9fb3d9]">Core</span>}
                </div>
              ))
            )}
          </div>
          <p className="text-[11px] text-[#677287]">Unsaved changes on this page aren’t included until you save.</p>
          <div className="flex justify-end">
            <Button
              type="button"
              className="h-auto rounded-lg bg-primary px-[18px] py-3 text-sm font-semibold text-white"
              onClick={() => setPreviewOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
