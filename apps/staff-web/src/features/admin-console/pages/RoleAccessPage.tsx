import { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { cn } from '@staff-web/lib/utils'
import { useListScreens } from '../api/screens'
import { useListRoles, useGetRoleScreens, useReplaceRoleScreens } from '../api/roles'
import { useStaffApi } from '../api/staff'
import { PAGE_CARD } from '../page-card'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { ScreenDto, StaffRow } from '../types'

/* Helpers --------------------------------------------------------------- */

/** Radix `Select` items cannot have an empty value, so "nobody picked" gets its own sentinel. */
const NO_STAFF = '__none__'

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
      title: `F${featureNo.padStart(2, '0')} ${featureLabel(featureNo)}`,
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

const SELECT_TRIGGER =
  'h-auto min-w-[220px] rounded-md border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#111827] shadow-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/10 data-[size=default]:h-[37px] max-phone:w-full max-phone:min-w-0'
const BTN_GHOST =
  'h-[33px] rounded-md border-[#d1d5db] bg-transparent px-3.5 text-[13px] font-normal text-[#374151] shadow-none hover:bg-[#f3f4f6]'
const BTN_PRIMARY = 'h-[33px] rounded-md bg-ink px-4 text-[13px] font-medium text-white hover:bg-[#142757] disabled:opacity-55'

/* Component ------------------------------------------------------------- */

/**
 * Role access page. The amber panel only appears once the checkboxes are dirty; saving it PUTs the whole grant set for
 * the selected role and the backend writes the audit row in the same transaction.
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

  /* "Preview as user" modal — the staff list is fetched when the modal opens, not with the page. */
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewStaff, setPreviewStaff] = useState<StaffRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null)

  /* Save state. The notice/error lives outside the save panel because the panel unmounts the moment `dirty` goes
     false — a success message rendered inside it would never be seen. */
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  const registry = useRoleAccess(roleId, listScreens, listRoles, getRoleScreens)
  const groups = useMemo(() => buildGroups(registry.screens), [registry.screens])
  const columns = useMemo(() => splitColumns(groups), [groups])

  const dirty = pending !== null && !setsEqual(pending, registry.granted)
  const diff = useMemo(() => {
    if (pending === null) return { added: [], removed: [] }
    return setsDiff(registry.granted, pending)
  }, [pending, registry.granted])

  /* The backend rejects a shorter reason with a 400 (`MIN_REASON_LENGTH` in the DTO). Mirror it here so the button
     disables itself instead of sending a request that can only fail. */
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH
  const saveTitle = reasonOk
    ? 'Write these screen grants and record the change in the audit log.'
    : `Give a reason of at least ${MIN_REASON_LENGTH} characters — it is stored on the audit entry.`

  /* Pick first role once roles load — render-time adjustment. */
  if (roleId === null && !registry.loading && registry.roles.length > 0) {
    setRoleId(registry.roles[0].id)
  }

  const currentRole = registry.roles.find((r) => r.id === roleId) ?? null

  /* Reset the edit state. Shared by undo, role switch, and a successful save. */
  function resetEdits() {
    setPending(null)
    setReason('')
    setSaveError(null)
    setSaveNotice(null)
  }

  /* Pick a role: wraps setRoleId + reset-the-edits so it can be called from one place. */
  function selectRole(newRoleId: string | null) {
    setRoleId(newRoleId)
    resetEdits()
  }

  /* Toggle a screen */
  function toggle(screenId: string, kind: ScreenDto['kind']) {
    if (kind !== 'assignable' || !roleId) return
    const base = pending ?? new Set(registry.granted)
    const next = new Set(base)
    if (next.has(screenId)) next.delete(screenId)
    else next.add(screenId)
    setPending(next)
    // A "Saved" or a failed-save message no longer describes what is on screen once a box moves.
    setSaveError(null)
    setSaveNotice(null)
  }

  /* Undo */
  function undo() {
    resetEdits()
  }

  /* Open the "Preview as user" modal and fetch the staff list for it. The list is loaded here rather than with the
     page: most admins never open the modal, and `GET /api/admin/staff` is admin-only and not cheap. */
  async function openPreview() {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const list = await staffApi.list()
      setPreviewStaff(list.staff)
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  /* What the picked staff member can actually open, mirroring the policy `GET /api/me/screens` applies on the server:
     core screens for everyone, admin screens for an `is_admin` role, assignable screens only with a grant. The
     pending set is used when there are unsaved changes, so the preview shows what the save would produce. */
  const previewSees = useMemo(() => {
    const role = currentRole
    if (!role) return []
    const granted = pending ?? registry.granted
    return registry.screens.flatMap((g) =>
      g.screens.filter((s) => (s.kind === 'core' ? true : s.kind === 'admin' ? role.is_admin : granted.has(s.id))),
    )
  }, [currentRole, pending, registry.granted, registry.screens])

  /* Save — the whole grant set goes to the server; there is no per-screen PATCH. */
  async function save() {
    if (!roleId || !pending || saving) return
    setSaving(true)
    setSaveError(null)
    setSaveNotice(null)
    try {
      const res = await replaceRoleScreens(roleId, { screen_ids: [...pending], reason: reason.trim() })
      // Take the server's set rather than our own: it is de-duplicated and sorted, and `changed: false` means the
      // role already matched, in which case no audit row was written.
      registry.setGranted(res.role_id, res.screen_ids)
      setPending(null)
      setReason('')
      setSaveNotice(
        res.changed
          ? res.audit_seq
            ? `Saved. Recorded in the audit log as #${res.audit_seq}.`
            : 'Saved.'
          : 'No changes to save — this role already had exactly those screens.',
      )
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

  const previewCandidates = previewStaff.filter((s) => s.role.id === currentRole?.id)

  return (
    <Card className={PAGE_CARD}>
      {/* Header row --------------------------------------------------- */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-8 max-phone:flex-col max-phone:items-stretch max-phone:gap-3.5">
        <div className="min-w-0 flex-auto">
          <h2 className="m-0 mb-1 font-heading text-xl font-semibold text-[#111827]">Screens for {currentRole?.name ?? '—'}</h2>
          <p className="max-w-[700px] text-xs leading-normal text-[#6b7280]">
            Pick which screens each role can see. Screen access only: what a screen allows is set by its own feature.
          </p>
        </div>
        <div className="flex flex-none flex-col items-stretch">
          <div className="flex flex-wrap items-end gap-2.5 max-phone:flex-col max-phone:items-stretch">
            <Button
              type="button"
              variant="outline"
              className={cn(BTN_GHOST, 'gap-1.5 max-phone:h-auto max-phone:w-full max-phone:py-[11px]')}
              onClick={() => void openPreview()}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              Preview as user
            </Button>
            {/* The label keeps its stacked position directly above the select, so it lives inside the field group
                rather than the row, where it would caption the button that comes first. */}
            <div className="flex min-w-0 flex-auto flex-col">
              <label className="mb-1 text-xs text-[#6b7280]" htmlFor="role-select">
                Role
              </label>
              <Select value={roleId ?? undefined} onValueChange={(v) => selectRole(v || null)}>
                <SelectTrigger id="role-select" className={SELECT_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans leading-[normal]">
                  {registry.roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-1.5 text-right text-xs font-semibold text-[#e07b00] max-phone:text-left">
            {currentRole?.staff_count ?? 0} staff with this role ·{' '}
            {dirty ? `${diff.added.length + diff.removed.length} unsaved changes` : '0 unsaved changes'}
          </p>
        </div>
      </div>

      {/* Screen matrix ----------------------------------------------- */}
      {registry.screens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d1d5db] bg-white p-8 text-center">
          <h3 className="mb-2 text-base font-semibold text-[#111827]">No screens registered yet</h3>
          <p className="text-sm text-[#6b7280]">
            Features self-register their screens via{' '}
            <code className="rounded-sm bg-[#f3f4f6] px-1.5 py-px font-mono text-xs">POST /api/admin/screens</code>. As soon as feature
            teams register theirs, they will appear here grouped by feature.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 items-start gap-6 max-wide:grid-cols-1">
          {columns.map((column, ci) => (
            <div className="min-w-0" key={ci}>
              {/* Column headers sit once at the top of each column, not on every group. In a single column (≤1100px)
                  the second column's copy would repeat mid-list, so it is hidden there. */}
              <div
                className={cn(
                  'grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-[17px] pb-1.5 text-[10px] leading-[26px] font-semibold tracking-[0.06em] whitespace-nowrap text-[#94a3b8] uppercase',
                  ci > 0 && 'max-wide:hidden',
                )}
                aria-hidden="true"
              >
                <span>Can see</span>
                <span>Screen</span>
                <span>Note</span>
              </div>

              {column.map((group) => (
                <section className="mb-4 overflow-hidden rounded-lg border border-line bg-white" key={group.key}>
                  <header className="flex items-baseline gap-1.5 border-b border-line bg-[#eef1f8] px-4 py-[9px] text-[11px] leading-[26px] font-bold tracking-[0.08em] text-[#1e293b] uppercase">
                    <span>{group.title}</span>
                    {group.locked && <span className="font-medium tracking-[0.04em] text-[#64748b]">· Admin only — locked</span>}
                  </header>

                  <ul className="px-4 pb-1.5">
                    {group.screens.map((s) => {
                      const inPending = pending ?? registry.granted
                      const checked = inPending.has(s.id)
                      const locked = s.kind !== 'assignable'
                      return (
                        <li
                          className={cn(
                            'grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#f1f2f6] py-1.5 text-sm leading-[26px] text-[#111827] first:border-t-0',
                            locked && 'text-[#64748b]',
                          )}
                          key={s.id}
                        >
                          <span className="flex min-h-[26px] items-center pl-[23px]">
                            <Checkbox
                              checked={checked}
                              disabled={locked || !roleId}
                              aria-label={s.name}
                              onCheckedChange={() => toggle(s.id, s.kind)}
                              className="size-[13px] rounded-[2px] border-[#767676] bg-white shadow-none data-[state=checked]:border-ink data-[state=checked]:bg-ink disabled:opacity-30 [&_svg]:size-[11px]"
                            />
                          </span>
                          <span className="truncate">{s.name}</span>
                          <span>
                            {s.kind === 'core' ? (
                              <span className="inline-block rounded-full bg-[#eef1f8] px-2.5 py-0.5 text-[11px] font-medium text-[#475569]">
                                {s.kind}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-[#6b7280]">
        Core and Admin screens are locked; only <strong>assignable</strong> screens can change.
      </p>

      {/* Save feedback sits above the panel so it survives the panel unmounting when `dirty` flips back to false. */}
      {(saveError || saveNotice) && (
        <p
          className={cn(
            'mt-4 rounded-md border border-[#b7dcc1] bg-[#e5f3e8] px-3 py-2 text-[13px] text-[#14532d]',
            saveError && 'border-[#f0b4b4] bg-[#fbe6e6] text-[#7f1d1d]',
          )}
          role="status"
        >
          {saveError ?? saveNotice}
        </p>
      )}

      {/* Save panel (sticky) ---------------------------------------- */}
      {roleId && dirty && (
        <div
          className="sticky bottom-0 -mx-8 mt-6 -mb-6 rounded-lg border border-[#e5b86a] bg-[#fff8e6] px-6 py-3.5 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] max-laptop:-mx-6 max-tablet:-mx-5 max-tablet:-mb-5 max-phone:-mx-4 max-phone:-mb-4 max-phone:rounded-none"
          role="region"
          aria-label="Unsaved changes"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-phone:w-full">
              <p className="mb-1.5 text-[13px] font-semibold text-[#92400e]">
                {diff.added.length} to grant, {diff.removed.length} to revoke
              </p>
              <Input
                className="h-[37px] w-80 rounded-md border-[#d1d5db] bg-white px-3 text-sm text-[#111827] shadow-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/10 max-phone:w-full md:text-sm"
                placeholder="Reason (required, ≥ 10 chars)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className={BTN_GHOST} onClick={undo} disabled={saving}>
                Undo changes
              </Button>
              <Button
                type="button"
                className={BTN_PRIMARY}
                disabled={!reasonOk || saving}
                title={saveTitle}
                onClick={() => {
                  void save()
                }}
              >
                {saving ? 'Saving…' : 'Save access'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal ---------------------------------------------- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[480px] max-w-[92vw] gap-0 rounded-lg border-0 px-6 py-5 font-sans leading-[normal] text-[#111827] shadow-[0_12px_28px_rgba(0,0,0,0.2)] sm:max-w-[92vw]"
        >
          <header className="mb-3 flex items-center justify-between">
            <DialogTitle className="text-base font-semibold text-[#111827]">Preview as user</DialogTitle>
            <Button type="button" variant="outline" className={BTN_GHOST} onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </header>
          <DialogDescription className="mb-3 text-xs leading-normal text-[#6b7280]">
            Pick a staff member to see what they can open. The list is what the server would answer for them: the core screens everyone has,
            the admin screens if their role is an admin, plus the screens granted to their role.
          </DialogDescription>
          {previewError ? (
            <p className="text-xs text-[#6b7280]">Could not load the staff list — {previewError}</p>
          ) : previewLoading ? (
            <p className="text-xs text-[#6b7280]">Loading staff…</p>
          ) : (
            <Select value={previewStaffId ?? NO_STAFF} onValueChange={(v) => setPreviewStaffId(v === NO_STAFF ? null : v)}>
              <SelectTrigger className={cn(SELECT_TRIGGER, 'w-full')} aria-label="Staff member">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="font-sans leading-[normal]">
                <SelectItem value={NO_STAFF}>No staff selected</SelectItem>
                {previewCandidates.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} — {s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <h4 className="mt-4 mb-2 text-[11px] font-bold tracking-[0.12em] text-[#6b7280]">THEY SEE</h4>
          <ul className="max-h-[220px] overflow-y-auto rounded-md border border-line">
            {previewSees.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-[#6b7280]">No screens currently granted.</li>
            ) : (
              previewSees.map((s) => (
                <li key={s.id} className="border-b border-[#f1f2f6] px-3 py-2 text-[13px] last:border-b-0">
                  <span className="font-mono text-xs text-[#4b5563]">{s.code}</span> · {s.name}
                </li>
              ))
            )}
          </ul>
          <footer className="mt-4 flex justify-end">
            <Button type="button" className={BTN_PRIMARY} onClick={() => setPreviewOpen(false)}>
              Done
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
