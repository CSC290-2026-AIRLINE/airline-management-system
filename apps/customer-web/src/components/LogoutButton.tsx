import { useState } from 'react'
import { useClerk } from '@clerk/clerk-react'
import { LogOut } from 'lucide-react'
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
import { Button } from '@customer-web/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@customer-web/components/ui/tooltip'

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

/**
 * Log out, as an icon button for the site header.
 *
 * It does what `AppAuthProvider.logout` does, in the same order: end the server session (clears the refresh cookie),
 * then sign out of Clerk. It does not use the provider because the header sits outside the signed-in layout; mounting a
 * second provider here would run a second session exchange on every signed-in page and double the sign-ins in the audit
 * log. Clerk reloads the app on the home page afterwards, which also drops the in-memory token.
 */
export default function LogoutButton({ className }: { className?: string }) {
  const { signOut } = useClerk()
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function logout() {
    setPending(true)
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // Signing out of Clerk below still ends the session on this device, so a failed server call is not a reason to stay.
    }
    await signOut({ redirectUrl: '/' })
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Log out"
              disabled={pending}
              onClick={() => setConfirmOpen(true)}
              className={className}
            />
          }
        >
          <LogOut />
        </TooltipTrigger>
        <TooltipContent side="bottom">Log out</TooltipContent>
      </Tooltip>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>You will be signed out of your account on this device.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void logout()}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
