import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '../components/Dialog'
import { Button } from '@staff-web/components/ui/button'
import { DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'

/**
 * A styled replacement for `window.confirm`, which freezes the page and cannot be themed or automated.
 * Render `dialog` somewhere in the component, then `if (!(await confirm('Remove X?'))) return`.
 */
export function useConfirm(confirmLabel = 'Remove'): { confirm: (message: string) => Promise<boolean>; dialog: ReactNode } {
  const [message, setMessage] = useState<string | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((text: string) => {
    setMessage(text)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function settle(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setMessage(null)
  }

  const dialog =
    message === null ? null : (
      <Dialog onClose={() => settle(false)}>
        <DialogHeader>
          <DialogTitle>{message}</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button variant="destructive" type="button" onClick={() => settle(true)}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </Dialog>
    )

  return { confirm, dialog }
}
