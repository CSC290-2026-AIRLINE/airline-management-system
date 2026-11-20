import { useEffect, useState, type FormEvent } from 'react'
import { useReverification, useUser } from '@clerk/clerk-react'
import { Button } from '@customer-web/components/ui/button'
import { DialogFooter } from '@customer-web/components/ui/dialog'
import { Input } from '@customer-web/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@customer-web/components/ui/input-otp'
import FormError from '@customer-web/features/passenger-profiles/components/FormError'
import FormField from '@customer-web/features/passenger-profiles/components/FormField'
import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'
import { cn } from '@customer-web/lib/utils'
import { useProfile } from '../profile-context'
import { errorMessage } from '../profile-api'

export default function ChangeEmailDialog({ onClose }: { onClose: () => void }) {
  const { user } = useUser()
  const { syncIdentity } = useProfile()
  type EmailAddress = NonNullable<typeof user>['emailAddresses'][number]
  const [address, setAddress] = useState<EmailAddress | null>(null)
  const [busy, setBusy] = useState(false)
  const [suspended, setSuspended] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState('')
  const createEmail = useReverification(async (value: string) => {
    if (!user) throw new Error('Please sign in again to change your email.')
    return user.createEmailAddress({ email: value })
  })
  const makePrimary = useReverification(async (id: string) => {
    if (!user) throw new Error('Please sign in again to change your email.')
    return user.update({ primaryEmailAddressId: id })
  })
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('')
  const alreadyVerified = address?.verification.status === 'verified'
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])
  async function resend() {
    if (!address || busy || cooldown) return
    setBusy(true)
    setStatus('')
    setNotice('')
    try {
      await address.prepareVerification({ strategy: 'email_code' })
      setCooldown(30)
      setNotice('A new code has been sent. Use the most recent code.')
      setCode('')
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus('')
    setNotice('')
    try {
      if (!user) throw new Error('Please sign in again to change your email.')
      if (step === 'email') {
        const value = email.trim()
        if (value.toLowerCase() === user.primaryEmailAddress?.emailAddress.toLowerCase())
          throw new Error('Enter a different email address.')
        // Hide the dialog so Clerk can display its session reverification modal if required.
        setSuspended(true)
        const existing = user.emailAddresses.find((item) => item.emailAddress.toLowerCase() === value.toLowerCase())
        const next = existing ?? (await createEmail(value))
        setSuspended(false)
        if (!next) throw new Error('Email change was cancelled. Please try again.')
        setAddress(next)
        setEmail(value)
        if (next.verification.status === 'verified') {
          setStep('code')
          setNotice('This address is already verified on your account. Confirm to make it your primary email.')
          return
        }
        await next.prepareVerification({ strategy: 'email_code' })
        setCooldown(30)
        setStep('code')
        return
      }
      if (!address) throw new Error('Start again and request a new code.')
      if (!confirmed) {
        const verified = address.verification.status === 'verified' ? address : await address.attemptVerification({ code })
        if (verified.verification.status !== 'verified') throw new Error('Enter the complete verification code.')
        setAddress(verified)
        setSuspended(true)
        const updated = await makePrimary(address.id)
        setSuspended(false)
        if (!updated) throw new Error('Email change was cancelled. Please try again.')
        setConfirmed(true)
      }
      await syncIdentity()
      onClose()
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setSuspended(false)
      setBusy(false)
    }
  }
  return (
    <ProfileDialog
      title={step === 'email' ? 'Change email' : 'Check your new email'}
      onClose={() => {
        if (!busy) onClose()
      }}
      suspended={suspended}
      steps={
        <ol className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Email change progress">
          <li className="font-medium text-foreground">1 New email</li>
          <li aria-hidden="true">→</li>
          <li className={cn(step === 'code' && 'font-medium text-foreground')} aria-current={step === 'code' ? 'step' : undefined}>
            2 Enter code
          </li>
        </ol>
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        {step === 'email' ? (
          <FormField label="New email">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            )}
          </FormField>
        ) : (
          <>
            <p className="text-sm">
              {alreadyVerified
                ? `Your email ${email} is verified. Confirm to finish updating your profile.`
                : `We sent a 6-digit code to ${email}. Your email changes only after you confirm it.`}
            </p>
            <InputOTP
              maxLength={6}
              autoFocus
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
              disabled={busy || confirmed || alreadyVerified}
              aria-label="Verification code"
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot key={index} index={index} aria-label={`Verification digit ${index + 1}`} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p className="text-sm text-muted-foreground">
              Didn’t get it?{' '}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                disabled={busy || cooldown > 0 || confirmed || alreadyVerified}
                onClick={() => void resend()}
              >
                Resend code{cooldown > 0 ? ` (${cooldown}s)` : ''}
              </Button>{' '}
              · Verification is handled by your sign-in provider (Clerk).
            </p>
          </>
        )}
        {notice && (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        )}
        {status && <FormError role="status">{status}</FormError>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || (step === 'code' && !confirmed && !alreadyVerified && code.length !== 6)}>
            {busy ? 'Please wait…' : confirmed ? 'Retry sync' : step === 'email' ? 'Continue' : 'Confirm email'}
          </Button>
        </DialogFooter>
      </form>
    </ProfileDialog>
  )
}
