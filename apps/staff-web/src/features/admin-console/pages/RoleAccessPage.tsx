import { useMemo, useState } from 'react'
import { useListScreens } from '../api/screens'
import { useListRoles, useGetRoleScreens, useReplaceRoleScreens } from '../api/roles'
import { useStaffApi } from '../api/staff'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { featureLabel } from '../feature-labels'
import { AdminErrorCard } from '../components/AdminErrorCard'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { ScreenDto, StaffRow } from '../types'
import './RoleAccessPage.css'

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

  if (registry.loading) return <p className="muted">Loading role access…</p>
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

  return (
    <section className="page-body">
      {/* Header row --------------------------------------------------- */}
      <div className="role-access-header">
        <div className="role-access-intro">
          <h2>Screens for {currentRole?.name ?? '—'}</h2>
          <p className="muted small">
            Pick which screens each role can see. Screen access only: what a screen allows is set by its own feature.
          </p>
        </div>
        <div className="role-access-controls">
          <div className="role-picker">
            <div className="role-picker-row">
              <button type="button" className="btn-ghost" onClick={() => void openPreview()}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
                  <circle cx="8" cy="8" r="1.8" />
                </svg>
                Preview as user
              </button>
              {/* The label keeps its stacked position directly above the select. It has to live inside the field
                    group rather than the row, or it would caption the button that now comes first in the row. */}
              <div className="role-picker-field">
                <label className="role-picker-label" htmlFor="role-select">
                  Role
                </label>
                <select id="role-select" className="role-select" value={roleId ?? ''} onChange={(e) => selectRole(e.target.value || null)}>
                  {registry.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="role-stats">
              {currentRole?.staff_count ?? 0} staff with this role ·{' '}
              {dirty ? `${diff.added.length + diff.removed.length} unsaved changes` : '0 unsaved changes'}
            </p>
          </div>
        </div>
      </div>

      {/* Screen matrix ----------------------------------------------- */}
      {registry.screens.length === 0 ? (
        <div className="empty-card">
          <h3>No screens registered yet</h3>
          <p className="muted">
            Features self-register their screens via <code>POST /api/admin/screens</code>. As soon as feature teams register theirs, they
            will appear here grouped by feature.
          </p>
        </div>
      ) : (
        <div className="screen-columns">
          {columns.map((column, ci) => (
            <div className="screen-column" key={ci}>
              {/* Column headers sit once at the top of each column, not on every group. */}
              <div className="group-cols" aria-hidden="true">
                <span>Can see</span>
                <span>Screen</span>
                <span>Note</span>
              </div>

              {column.map((group) => (
                <section className="screen-group" key={group.key}>
                  <header className="group-header">
                    <span>{group.title}</span>
                    {group.locked && <span className="group-lock">· ADMIN ONLY — LOCKED</span>}
                  </header>

                  <ul className="screen-rows">
                    {group.screens.map((s) => {
                      const inPending = pending ?? registry.granted
                      const checked = inPending.has(s.id)
                      const locked = s.kind !== 'assignable'
                      return (
                        <li className={locked ? 'row-locked' : ''} key={s.id}>
                          <input type="checkbox" checked={checked} disabled={locked || !roleId} onChange={() => toggle(s.id, s.kind)} />
                          <span className="screen-name">{s.name}</span>
                          <span className="screen-note">{s.kind === 'core' ? <span className="note-pill">{s.kind}</span> : null}</span>
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

      <p className="footnote muted">
        Core and Admin screens are locked; only <strong>assignable</strong> screens can change.
      </p>

      {/* Save feedback sits above the panel so it survives the panel unmounting when `dirty` flips back to false. */}
      {(saveError || saveNotice) && (
        <p className={saveError ? 'save-feedback is-error' : 'save-feedback'} role="status">
          {saveError ?? saveNotice}
        </p>
      )}

      {/* Save panel (sticky) ---------------------------------------- */}
      {roleId && dirty && (
        <div className="save-panel" role="region" aria-label="Unsaved changes">
          <div className="save-panel-body">
            <div>
              <p className="save-summary">
                {diff.added.length} to grant, {diff.removed.length} to revoke
              </p>
              <input
                className="reason-input"
                placeholder="Reason (required, ≥ 10 chars)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="save-actions">
              <button type="button" className="btn-ghost" onClick={undo} disabled={saving}>
                Undo changes
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!reasonOk || saving}
                title={saveTitle}
                onClick={() => {
                  void save()
                }}
              >
                {saving ? 'Saving…' : 'Save access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal ---------------------------------------------- */}
      {previewOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Preview as user" onClick={() => setPreviewOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Preview as user</h3>
              <button type="button" className="btn-ghost" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </header>
            <p className="muted small">
              Pick a staff member to see what they can open. The list is what the server would answer for them: the core screens everyone
              has, the admin screens if their role is an admin, plus the screens granted to their role.
            </p>
            {previewError ? (
              <p className="muted small">Could not load the staff list — {previewError}</p>
            ) : previewLoading ? (
              <p className="muted small">Loading staff…</p>
            ) : (
              <select className="role-select" value={previewStaffId ?? ''} onChange={(e) => setPreviewStaffId(e.target.value || null)}>
                <option value="">No staff selected</option>
                {previewStaff
                  .filter((s) => s.role.id === currentRole?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} — {s.email}
                    </option>
                  ))}
              </select>
            )}
            <h4 className="preview-sees-label">THEY SEE</h4>
            <ul className="preview-list">
              {previewSees.length === 0 ? (
                <li className="muted">No screens currently granted.</li>
              ) : (
                previewSees.map((s) => (
                  <li key={s.id}>
                    <span className="mono">{s.code}</span> · {s.name}
                  </li>
                ))
              )}
            </ul>
            <footer>
              <button type="button" className="btn-primary" onClick={() => setPreviewOpen(false)}>
                Done
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
