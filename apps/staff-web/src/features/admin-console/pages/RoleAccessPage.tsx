import { useEffect, useMemo, useState } from 'react'
import { CircleAlert, Eye, X } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { cn } from '@staff-web/lib/utils'
import { useListScreens } from '../api/screens'
import { useListRoles, useGetRoleScreens, useReplaceRoleScreens } from '../api/roles'
import { errorText } from '../api/fetch'
import { useStaffApi } from '../api/staff'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { ScreenDto, StaffRow, StaffScreensResponse } from '../types'

/* Helpers --------------------------------------------------------------- */

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

/** Read the HTTP status the API wrapper puts first in a thrown message — `401 Unauthorized: {…}`. Anchored, so a number later in the text is never mistaken for a status. */
function statusFromError(msg: string): number | undefined {
  const m = /^\s*(\d{3})\b/.exec(msg)
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

const LOCKED_TIP = 'Core and Admin screens can’t be given or taken away'

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
  /* The chosen person's menu, from `GET /api/admin/staff/:id/screens`. `id` says whose answer it is. */
  const [previewMenu, setPreviewMenu] = useState<{
    id: string | null
    loading: boolean
    data: StaffScreensResponse | null
    error: string | null
  }>({ id: null, loading: false, data: null, error: null })

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
  /* Screen names for the save panel's "Gains / Loses" lists. */
  const screenNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const g of registry.screens) for (const s of g.screens) names.set(s.id, s.name)
    return names
  }, [registry.screens])
  const nameOf = (id: string) => screenNames.get(id) ?? id

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

  /* What the chosen person can actually open, worked out by the server for that person (`GET /api/admin/staff/:id/
     screens`) with the same rules as their own `GET /api/me/screens`. Saved grants only — the dialog says unsaved changes
     are not included. A new person resets the answer while rendering; the effect fetches it. */
  const previewWanted = previewOpen ? previewStaffId : null
  if (previewWanted !== previewMenu.id) {
    setPreviewMenu({ id: previewWanted, loading: !!previewWanted, data: null, error: null })
  }
  useEffect(() => {
    if (!previewWanted) return
    let cancelled = false
    staffApi
      .screens(previewWanted)
      .then((data) => {
        if (!cancelled) setPreviewMenu({ id: previewWanted, loading: false, data, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setPreviewMenu({ id: previewWanted, loading: false, data: null, error: errorText(e) })
      })
    return () => {
      cancelled = true
    }
    // `staffApi` closes over `fetchWithAuth`, recreated every render; see `useStaffApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewWanted])
  const previewSees = previewMenu.data?.screens ?? []

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
      setSaveError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  /* Render ------------------------------------------------------------ */

  /* A user with no staff row never reaches this point — the layout route answers that case first. */

  if (registry.loading) {
    return (
      <Card className="pt-7 pb-6" role="status" aria-live="polite" aria-busy="true">
        <CardContent className="flex flex-col gap-4 px-6 max-tablet:px-4">
          <span className="sr-only">Loading role access…</span>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full max-w-prose" />
          <Skeleton className="h-9 w-56 max-tablet:w-full" />
          <div className="mt-2 flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  if (registry.error) {
    /* A signed-in non-admin gets 403 from AdminConsoleGuard. That is an authorization answer, not a broken setup,
       so it renders the shared access-denied card rather than the setup checklist. */
    if (statusFromError(registry.error) === 403) {
      return <NoAccessScreen screenName="Role access" homeTo="/" />
    }
    return <AdminErrorCard page="Role access" error={registry.error} status={statusFromError(registry.error)} onRetry={registry.reload} />
  }

  const granted = pending ?? registry.granted
  const previewCandidates = previewStaff.filter((s) => s.role.id === currentRole?.id)
  const previewPerson = previewCandidates.find((s) => s.id === previewStaffId) ?? null

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Screens for {currentRole?.name ?? '—'}</CardTitle>
          <CardDescription>
            Pick which screens each role can see. Screen access only: what a screen allows is set by its own feature.
          </CardDescription>
          <CardAction>
            <Button type="button" variant="outline" onClick={() => void openPreview()}>
              <Eye aria-hidden="true" />
              <span className="max-phone:hidden">Preview as user</span>
              <span className="hidden max-phone:inline">Preview</span>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {/* Role picker + status ----------------------------------------- */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex w-56 flex-col gap-1.5 max-tablet:w-full">
              <Label className="text-xs text-muted-foreground" htmlFor="role-select">
                Role
              </Label>
              <Select value={roleId ?? undefined} onValueChange={(v) => selectRole(v || null)} disabled={dirty || saving}>
                <SelectTrigger id="role-select" className="w-full" aria-describedby={dirty ? 'role-select-hint' : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="border-border font-sans">
                  {registry.roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dirty && (
                <p id="role-select-hint" className="text-xs text-muted-foreground">
                  Save or discard your changes to switch roles.
                </p>
              )}
            </div>
            <p className="text-sm font-medium text-warning tabular-nums" aria-live="polite">
              {currentRole?.staff_count ?? 0} staff with this role · {changeCount} unsaved change{changeCount === 1 ? '' : 's'}
            </p>
          </div>

          {registry.missingRoleId && registry.missingRoleId === roleId && (
            <Alert variant="destructive" className="mb-4 border-danger-line/40 bg-danger-soft">
              <CircleAlert aria-hidden="true" />
              <AlertDescription className="flex flex-wrap items-center gap-3 text-current">
                Role not found. It may have been removed since this page loaded.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    selectRole(null)
                    registry.reload()
                  }}
                >
                  Reload roles
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Screen matrix ----------------------------------------------- */}
          {registry.screens.length === 0 ? (
            <Card className="mt-6 border-dashed text-center">
              <CardContent className="px-8">
                <h3 className="mb-2 text-base font-semibold text-foreground">No screens registered yet</h3>
                <p className="text-sm text-muted-foreground">
                  Each feature team registers its own screens. As soon as they do, they will appear here grouped by feature.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-5 grid grid-cols-2 items-start gap-16 max-wide:grid-cols-1 max-wide:gap-2.5 max-tablet:mt-4">
              {columns.map((column, ci) => (
                <div className="flex min-w-0 flex-col gap-2.5" key={ci}>
                  {/* Column headers sit once at the top of each column. In one column (≤1100px) the second copy would
                    repeat mid-list, so it is hidden there; the phone design has none. */}
                  <div
                    className={cn('flex gap-5 text-xs font-semibold text-muted-foreground max-tablet:hidden', ci > 0 && 'max-wide:hidden')}
                    aria-hidden="true"
                  >
                    <span>CAN SEE</span>
                    <span className="flex-1">SCREEN</span>
                    <span className="pr-1.5">NOTE</span>
                  </div>

                  {column.map((group) => (
                    <section key={group.key} aria-label={group.title}>
                      <header className="bg-muted py-2.5 pl-3 text-xs font-semibold text-foreground uppercase">
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
                                'flex h-12 items-center gap-5 border-b border-border pr-1.5 pl-4 text-sm text-foreground max-tablet:h-10 max-tablet:gap-3 max-tablet:border-0 max-tablet:pl-0 max-tablet:text-sm',
                                locked ? 'cursor-default hover:bg-accent' : 'cursor-pointer hover:bg-accent',
                              )}
                              onClick={() => toggle(s.id, s.kind)}
                            >
                              <Checkbox
                                checked={checked}
                                aria-disabled={locked || !roleId}
                                aria-label={s.name}
                                className={cn(
                                  locked &&
                                    'data-[state=checked]:border-input data-[state=checked]:bg-muted data-[state=checked]:text-muted-foreground',
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggle(s.id, s.kind)
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate">{s.name}</span>
                              {s.kind === 'core' && (
                                <Badge variant="secondary" className="w-20 text-muted-foreground">
                                  Core
                                </Badge>
                              )}
                              {unsaved && <Badge className="w-20 bg-warning-soft text-warning">Unsaved</Badge>}
                              {locked && <span className="sr-only">{LOCKED_TIP}</span>}
                            </li>
                          )
                          if (!locked) return row
                          return (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>{row}</TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="start"
                                className="bg-foreground px-2 py-1.5 font-sans text-white [&>svg]:hidden"
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
        </CardContent>
      </Card>

      {/* Save changes panel ------------------------------------------ */}
      {roleId && dirty && (
        <Card
          className={cn('mt-5 border-border bg-warning-soft pt-6 pb-6', reasonMissing && 'border-border')}
          role="region"
          aria-label="Save changes"
        >
          <CardContent className="px-6 max-tablet:px-4">
            <h3 className={cn('m-0 text-xl font-bold text-warning', reasonMissing && 'text-foreground')}>
              {reasonMissing ? 'Add a reason before saving access.' : 'Save changes'}
            </h3>
            <p className="mt-2 text-sm text-foreground">
              Applies to {currentRole?.staff_count ?? 0} staff with the {currentRole?.name} role.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 max-phone:grid-cols-1" aria-label="Screens changing">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground">Gains ({diff.added.length})</h4>
                <ul className="mt-1 text-sm text-foreground">
                  {diff.added.length === 0 ? (
                    <li className="text-muted-foreground">None</li>
                  ) : (
                    diff.added.map((id) => <li key={id}>+ {nameOf(id)}</li>)
                  )}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground">Loses ({diff.removed.length})</h4>
                <ul className="mt-1 text-sm text-foreground">
                  {diff.removed.length === 0 ? (
                    <li className="text-muted-foreground">None</li>
                  ) : (
                    diff.removed.map((id) => <li key={id}>− {nameOf(id)}</li>)
                  )}
                </ul>
              </div>
            </div>
            <Label htmlFor="access-reason" className={cn('mt-4 mb-0.5 text-muted-foreground', reasonMissing && 'sr-only')}>
              Reason (saved in the audit log)
            </Label>
            <Input
              id="access-reason"
              className={cn('text-sm md:text-sm', reasonMissing && 'mt-5 border-danger-line focus-visible:border-danger-line')}
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
              <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger" role="alert">
                {saveError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2.5 max-phone:mt-4">
              <Button type="button" variant="outline" className="w-40 max-phone:flex-1" onClick={resetEdits} disabled={saving}>
                Discard changes
              </Button>
              <Button type="button" className="w-35 max-phone:flex-1" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save access'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved -------------------------------------------------------- */}
      {roleId && !dirty && panel.kind === 'saved' && (
        <Card className="mt-5 border-border bg-success-soft pt-4 pb-6" role="status">
          <CardContent className="px-6 max-tablet:px-4">
            <p className="text-foreground">
              <span className="text-xl font-bold">Saved. </span>
              <span className="text-sm font-medium italic">
                Applies to {panel.staffCount} staff with this role in their next page load.
              </span>
            </p>
            <Label htmlFor="saved-reason" className="mt-1.5 mb-1 text-muted-foreground">
              Reason (saved in the audit log)
            </Label>
            <Input id="saved-reason" className="text-sm md:text-sm" value={panel.reason} readOnly />
            <div className="mt-6 flex justify-end">
              <Button type="button" className="w-40 bg-navy text-white hover:bg-navy-active" onClick={() => undoSaved(panel.previous)}>
                Revert this save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted-foreground">Core and Admin screens are locked; only assignable screens can change.</p>

      {/* Preview as user --------------------------------------------- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex w-130  flex-col gap-3.5 border-0 bg-background p-6 font-sans text-foreground"
        >
          <header className="flex items-center gap-2">
            <DialogTitle className="flex-1 text-xl font-bold text-foreground">Preview as user</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close"
            >
              <X className="size-5" />
            </Button>
          </header>
          <DialogDescription className="text-sm text-muted-foreground">
            See exactly the menu a staff member gets. It follows their role.
          </DialogDescription>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-foreground" htmlFor="preview-staff">
              Staff member
            </Label>
            {previewError ? (
              <p className="text-sm text-danger">Could not load the staff list — {previewError}</p>
            ) : previewLoading ? (
              <p className="text-sm text-muted-foreground">Loading staff…</p>
            ) : previewCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has the {currentRole?.name} role yet.</p>
            ) : (
              <Select value={previewStaffId ?? undefined} onValueChange={setPreviewStaffId}>
                <SelectTrigger
                  id="preview-staff"
                  className="h-auto w-full border-input bg-background px-3.5 py-3 text-sm font-medium text-foreground"
                >
                  <SelectValue placeholder="Choose a staff member" />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans">
                  {previewCandidates.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} · {s.role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl bg-navy px-3.5 py-4">
            <p className="text-xs font-semibold text-white/70 uppercase">
              {previewPerson ? `${previewPerson.first_name} ${previewPerson.last_name}` : (currentRole?.name ?? 'This role')} sees
            </p>
            {!previewPerson ? (
              <p className="px-2.5 py-2 text-sm text-white/70">Choose a staff member.</p>
            ) : previewMenu.loading ? (
              <p className="px-2.5 py-2 text-sm text-white/70">Loading their menu…</p>
            ) : previewMenu.error ? (
              <p className="px-2.5 py-2 text-sm text-white/70">Could not load their menu — {previewMenu.error}</p>
            ) : previewMenu.data && !previewMenu.data.active ? (
              <p className="px-2.5 py-2 text-sm text-white/70">This account is deactivated, so it can’t sign in and sees no menu.</p>
            ) : previewSees.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-white/70">No screens yet.</p>
            ) : (
              previewSees.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md px-2.5 py-2">
                  <span className="text-sm font-medium text-white">{s.name}</span>
                  <span className="flex-1" />
                  {s.kind === 'core' && <span className="text-xs font-semibold text-white/70">Core</span>}
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">Unsaved changes on this page aren’t included until you save.</p>
          <div className="flex justify-end">
            <Button type="button" className="h-auto bg-primary py-3 text-sm text-white" onClick={() => setPreviewOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
