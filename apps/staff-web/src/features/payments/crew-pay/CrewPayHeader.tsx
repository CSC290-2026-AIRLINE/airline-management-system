import type { Viewer } from './api'

/** The crew pay page header: the title, and who is signed in at the top right. */
export function CrewPayHeader({ viewer, title }: { viewer?: Viewer; title: string }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <h1 className="m-0 font-sans text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      {viewer && (
        <span className="pt-2 text-sm text-muted-foreground">
          {viewer.first_name} · {viewer.role}
        </span>
      )}
    </header>
  )
}
