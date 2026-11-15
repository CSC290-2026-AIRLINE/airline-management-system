import type { Viewer } from './api'

/** The crew pay page header, the same heading and subtitle as `StaffPageShell`, and who is signed in at the top right. */
export function CrewPayHeader({ viewer, title, subtitle }: { viewer?: Viewer; title: string; subtitle?: string }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="m-0 font-sans text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 mb-0 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {viewer && (
        <span className="pt-1 text-sm text-muted-foreground">
          {viewer.first_name} · {viewer.role}
        </span>
      )}
    </header>
  )
}
