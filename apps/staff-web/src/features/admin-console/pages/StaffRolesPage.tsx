import './StaffRolesPage.css'

/**
 * Staff & roles tab — reserved for the companion PR (Feature 15b). The admin guard and the role/screen registry are
 * already in place, so the only thing missing from this page is the staff CRUD itself.
 */
export function StaffRolesPage() {
  return (
    <section className="page-body">
      <div className="staff-roles-stub">
        <h2>Staff &amp; roles</h2>
        <p className="muted">
          Reserved for the staff-CRUD endpoints (companion work). The admin-only guard and the screen registry already enforce that only{' '}
          <code>is_admin</code> accounts reach this page.
        </p>
        <p className="muted small">
          When this page is wired up, it should call <code>GET /api/admin/staff</code>, <code>POST /api/admin/staff</code>, and{' '}
          <code>PATCH /api/admin/staff/:id</code> — those endpoints are out of scope for this PR.
        </p>
      </div>
    </section>
  )
}
