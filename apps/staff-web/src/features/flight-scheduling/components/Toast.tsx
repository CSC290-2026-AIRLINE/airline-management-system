// Confirmation message pinned to the bottom of the screen; pair it with useNotice.
export function Toast({ message, tone = 'default' }: { message: string | null; tone?: 'default' | 'warn' }) {
  return message ? (
    <p className={`fs-toast${tone === 'warn' ? ' fs-toast-warn' : ''}`} role="status">
      {message}
    </p>
  ) : null
}
