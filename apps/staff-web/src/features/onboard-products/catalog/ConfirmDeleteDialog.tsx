// Confirmation before deleting a product. Shows the product name and the PRODUCT_IN_USE message when the delete is refused.

import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import type { Product } from '../api/types'

interface Props {
  product: Product
  busy: boolean
  errorMessage: string | null
  /** What the delete does. Defaults to the product wording. */
  description?: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDeleteDialog({ product, busy, errorMessage, description, onClose, onConfirm }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {product.name}?</DialogTitle>
          <DialogDescription>
            {description ?? 'This removes the product from the catalog. Existing orders keep their name and price.'}
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
