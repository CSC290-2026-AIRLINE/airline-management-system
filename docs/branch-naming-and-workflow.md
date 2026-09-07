# Branch Naming & Git Workflow

## Team ID

Every branch and commit is scoped to a **team ID**: `g01`–`g16`, or `core` for platform-wide work (auth/RBAC/shared code, owned by dev leads + infra leads).

Use your team ID in branches and commits — never a module name, never a person's name. Team IDs don't change even if members do or the module they're assigned to changes. Which team owns which module lives in `backend-structure.md` / `frontend-structure.md`, not here — this doc only cares about the ID.

---

## Branch Naming

All feature branches must branch off **`dev`**:

```
<type>/<team-id>-<short-description>
```

- `type`: `feature`, `fix`, `refactor`, `chore`, `docs`, `test`
- `team-id`: lowercase, from the table above (`g03`, `core`, etc.)
- `short-description`: lowercase, hyphen-separated, no underscores, no spaces, max ~6 words

**Examples:**

```
feature/g03-seat-hold-ttl
fix/g07-boarding-pass-qr-bug
refactor/g04-fare-rules-engine
docs/core-readme-update
chore/g11-cleanup-unused-imports
```

**Not allowed:** `johns-branch`, `test123`, `fix-bug`, `Feature/G03_SeatHold`, anything with your name, anything without a team-id.

> **Protected Branches:** Direct pushes to both `dev` and `main` are strictly forbidden.

---

## Commit Messages

Follow Conventional Commits, scoped by team ID:

```
<type>(<team-id>): <description>
```

**Examples:**

```
feat(g03): add seat hold TTL and automatic release
fix(g07): correct QR code generation for boarding pass
docs(core): add onboarding steps for new backend module
chore(g14): remove dead code in notification templating
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`

Keep the description under ~72 characters. If you need more detail, put it in the commit body, not the subject line.

---

## Pull Requests

### 1. Feature PRs (Target: `dev`)

All day-to-day development work merges into `dev`.

**PR title:**

```
[G03] Add seat hold TTL and automatic release
```

**PR Requirements:**

- Must use the PR template (explain what changed, how it was tested, screenshots if UI).
- Size limit: Keep diffs under ~400 lines where possible.
- **Required Approvals:** Minimum **2 approvals** + explicit approval from designated Code Owners (`CODEOWNERS`).
- All review threads must be resolved.
- **Merge Method:** **Squash and merge** only.
- **Merge Authority:** Merged exclusively by **Dev Leads**.

### 2. Release PRs (Target: `main`)

Production releases follow a strict integration pipeline from `dev` to `main`.

- **Source:** Must originate from `dev` only (PRs from feature branches directly to `main` are blocked automatically).
- **Merge Method:** **Merge commit** only (preserves release checkpoints and branch history).
- **Approvals & Merge Authority:** Handled and approved exclusively by **Infra Leads**.

---

## Branching Model

Two long-lived branches (`main` for releases, `dev` for integration):

1. **Branch off `dev`:** `git checkout dev && git pull origin dev && git checkout -b feature/<team-id>-<feature>`
2. **Develop & Commit:** Commit changes using conventional commit standards.
3. **Open PR against `dev`:** Open a PR as soon as code is reviewable.
4. **Code Review:** Obtain 2 approvals (including Code Owner).
5. **Merge:** Dev Leads squash-merge the PR into `dev`.
6. **Cleanup:** Delete the feature branch immediately after merging.

---

## Cross-module Changes

If your PR touches a folder owned by another team (shared code, another module's exposed interface), `CODEOWNERS` will automatically request that team's lead as a reviewer. Do not merge until they have approved.

**API contracts between modules freeze by week 3–4.** After that point, changing an endpoint another team depends on requires agreement from both teams before the PR opens, not after.
