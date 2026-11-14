import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@customer-web/components/ui/alert-dialog'

export default function RemovePhotoDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
          <AlertDialogDescription>Your initials will be shown instead. You can upload a new photo any time.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            <Trash2 />
            Remove photo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
