import type { ReactNode } from 'react'

interface CustomerShellProps {
  title: string
  /** A link or button on the right of the page heading — the "export" button, for example. */
  action?: ReactNode
  children: ReactNode
}

/** The frame every customer page in this feature sits in, under the app's own site header: the page heading and the body. */
export function CustomerShell({ title, action, children }: CustomerShellProps) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 text-left md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {action}
      </div>
      {children}
    </main>
  )
}
