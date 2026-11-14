import { useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, Eye, Plus, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { TooltipProvider } from '@staff-web/components/ui/tooltip'
import { cn } from '@staff-web/lib/utils'
import { useListScreens } from '../api/screens'
import { useRoleApi, type CreateRoleBody } from '../api/roles'
import { useStaffApi } from '../api/staff'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { buildGroups, filterGroups } from '../screen-groups'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { CreateRoleDialog } from '../components/CreateRoleDialog'
import { DeleteRoleDialog } from '../components/DeleteRoleDialog'
import { NoAccessScreen } from '../components/NoAccessScreen'
import { RoleList } from '../components/RoleList'
import { ScreenMatrix } from '../components/ScreenMatrix'
import { SidebarPreview } from '../components/SidebarPreview'
import type { RoleSummary, ScreenKind, StaffRow } from '../types'

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
  for (const v of b) if (!a.has(v)) added.push(v)
  for (const v of a) if (!b.has(v)) removed.push(v)
  return { added, removed }
}

/* Shared class lists ------------------------------------------------------ */

/** What the save panel under the card is showing. */
type Panel = { kind: 'idle' } | { kind: 'saved'; reason: string; previous: string[]; staffCount: number }

/** The banner above the card: a green line after a create or delete, a red one when something went wrong. */
interface Notice {
  tone: 'success' | 'error'
  title: string
  body: string
}

/* Component ------------------------------------------------------------- */

/**
 * Role access page. The left column lists the roles; the right column shows the screens of the selected role.
 * Ticking a box marks the row "Unsaved" and opens the Save changes panel under the card; saving PUTs the whole grant
 * set for the selected role and the backend writes the audit row in the same transaction. After a save the panel turns
 * green and offers a revert, which puts the previous set back as unsaved changes (it still needs a reason to save).
 *
 * Both access gates live in `routes/_authenticated/admin/route.tsx`, one level up: it owns `RequireStaff` (one
 * `GET /api/me/screens` for all three tabs). Do not add another gate in here.
 */
export function RoleAccessPage() {
  const listScreens = useListScreens()
  const roleApi = useRoleApi()
  const staffApi = useStaffApi()

  /* Role selection. The first role is picked once the roles load — see the render-time adjustment below. */
  const [roleId, setRoleId] = useState<string | null>(null)

  /* Edit state — pending = null means "no unsaved changes" */
  const [pending, setPending] = useState<Set<string> | null>(null)
  const [reason, setReason] = useState('')
  /** Set when Save was pressed without a long-enough reason: the panel turns red until the reason is fixed. */
  const [reasonMissing, setReasonMissing] = useState(false)
  /** The screen search box. */
  const [search, setSearch] = useState('')

  /* Create and delete */
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoleSummary | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  /* "Preview as user" dialog — the staff list is fetched when it opens, not with the page. */
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewStaff, setPreviewStaff] = useState<StaffRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>({ kind: 'idle' })

  const registry = useRoleAccess(roleId, listScreens, roleApi.list, roleApi.screens)
  const groups = useMemo(() => buildGroups(registry.screens), [registry.screens])
  const visibleGroups = useMemo(() => filterGroups(groups, search), [groups, search])
  /** The role list is A–Z by name; the API answers with the admin roles first. */
  const roles = useMemo(() => [...registry.roles].sort((a, b) => a.name.localeCompare(b.name)), [registry.roles])

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

  /* Pick the first role once the roles load — render-time adjustment. */
  if (roleId === null && !registry.loading && roles.length > 0) {
    setRoleId(roles[0].id)
  }

  const currentRole = roles.find((r) => r.id === roleId) ?? null

  /** Reset the edit state. Shared by undo, role switch, and a successful save. */
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
    setNotice(null)
  }

  function toggle(screenId: string, kind: ScreenKind) {
    if (kind !== 'assignable' || !roleId || currentRole?.is_admin) return
    const base = pending ?? new Set(registry.granted)
    const next = new Set(base)
    if (next.has(screenId)) next.delete(screenId)
    else next.add(screenId)
    setPending(next)
    // A "Saved" or a failed-save message no longer describes what is on screen once a box moves.
    setSaveError(null)
    setPanel({ kind: 'idle' })
  }

  /** After a save, Revert brings the previous set back as unsaved changes — reverting is a change too, with its own reason. */
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
      g.screens.filter((s) => (s.kind === 'core' || role.is_admin ? true : s.kind === 'admin' ? false : registry.granted.has(s.id))),
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
      const res = await roleApi.replaceScreens(roleId, { screen_ids: [...pending], reason: savedReason })
      // Take the server's set rather than our own: it is de-duplicated and sorted.
      registry.setGranted(res.role_id, res.screen_ids)
      resetEdits()
      if (!res.changed) {
        setNotice({ tone: 'success', title: 'Nothing to save', body: 'That role already had exactly these screens.' })
      } else {
        setPanel({ kind: 'saved', reason: savedReason, previous, staffCount: currentRole?.staff_count ?? 0 })
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /* Create a role — the dialog owns the form; this does the request and puts the new role in the list. */
  async function createRole(body: CreateRoleBody) {
    const created = await roleApi.create(body)
    await registry.reloadRoles()
    setCreateOpen(false)
    selectRole(created.id)
    setNotice({ tone: 'success', title: 'Role created', body: `${created.name} is ready to be given to staff.` })
  }

  /* Delete a role — only offered for a role nobody holds. */
  async function deleteRole(deleteReason: string) {
    const target = deleteTarget
    if (!target) return
    await roleApi.remove(target.id, { reason: deleteReason })
    await registry.reloadRoles()
    setDeleteTarget(null)
    // Move the selection to the next role in the list.
    const next = roles.find((r) => r.id !== target.id)
    selectRole(next?.id ?? null)
    setNotice({ tone: 'success', title: 'Role deleted', body: `${target.name} was removed.` })
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
    if (registry.status === 403) {
      return <NoAccessScreen screenName="Role access" homeTo="/" />
    }
    return <AdminErrorCard page="Role access" error={registry.error} status={registry.status} onRetry={registry.reload} />
  }

  const previewCandidates = previewStaff.filter((s) => s.role.id === currentRole?.id)
  const previewPerson = previewCandidates.find((s) => s.id === previewStaffId) ?? null

  return (
    <TooltipProvider delayDuration={200}>
      {/* Banner ------------------------------------------------------- */}
      {notice && (
        <Alert
          role={notice.tone === 'error' ? 'alert' : 'status'}
          variant={notice.tone === 'error' ? 'destructive' : 'default'}
          className={cn(
            'mb-4',
            notice.tone === 'error' ? 'border-danger-line/40 bg-danger-soft' : 'border-success/30 bg-success-soft text-success-strong',
          )}
        >
          {notice.tone === 'error' ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription className="text-current">{notice.body}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Roles &amp; screen access</CardTitle>
          <CardDescription>
            Create roles and choose which screens each role can open. Screen access only: what a screen allows is set by its own feature.
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
          <div className="flex gap-8 max-tablet:flex-col max-tablet:gap-5">
            {/* Role list ------------------------------------------------ */}
            <div className="flex w-70 shrink-0 flex-col gap-4 max-tablet:w-full">
              <Button type="button" variant="outline" className="w-fit" onClick={() => setCreateOpen(true)} disabled={dirty || saving}>
                <Plus aria-hidden="true" />
                Create role
              </Button>
              <RoleList
                roles={roles}
                selectedId={roleId}
                onSelect={(id) => selectRole(id)}
                onDelete={(role) => setDeleteTarget(role)}
                disabled={dirty}
              />
            </div>

            {/* Screens -------------------------------------------------- */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <h3 className="m-0 text-xl font-bold text-foreground">Screens for {currentRole?.name ?? '—'}</h3>
                <p className="mt-1 mb-0 text-sm font-medium text-warning tabular-nums" aria-live="polite">
                  {currentRole?.staff_count ?? 0} staff with this role · {changeCount} unsaved change{changeCount === 1 ? '' : 's'}
                </p>
              </div>
              <ScreenMatrix
                groups={visibleGroups}
                granted={registry.granted}
                pending={pending}
                isAdminRole={!!currentRole?.is_admin}
                onToggle={toggle}
                search={search}
                onSearchChange={setSearch}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save changes panel ------------------------------------------ */}
      {roleId && dirty && (
        <Card className={cn('mt-5 border-border bg-warning-soft pt-6 pb-6')} role="region" aria-label="Save changes">
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
                Cancel
              </Button>
              <Button type="button" className="w-35 max-phone:flex-1" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
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

      {/* Create role ------------------------------------------------- */}
      {createOpen && <CreateRoleDialog groups={groups} onCancel={() => setCreateOpen(false)} onSubmit={createRole} />}

      {/* Delete role ------------------------------------------------- */}
      {deleteTarget && <DeleteRoleDialog role={deleteTarget} onCancel={() => setDeleteTarget(null)} onSubmit={deleteRole} />}

      {/* Preview as user --------------------------------------------- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent showCloseButton={false} className="flex w-130 flex-col gap-3.5 border-0 bg-background p-6 font-sans text-foreground">
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

          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {previewPerson ? `${previewPerson.first_name} ${previewPerson.last_name}` : (currentRole?.name ?? 'This role')} sees
          </p>
          <SidebarPreview screens={previewSees} roleName={currentRole?.name ?? 'This role'} />
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
