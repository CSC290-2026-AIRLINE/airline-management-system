import { useEffect, useRef, useState, type FormEvent } from 'react'
import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'
import { useReverification, useUser } from '@clerk/clerk-react'
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
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [status, setStatus] = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])
  useEffect(() => {
    if (step === 'code') inputs.current[0]?.focus()
  }, [step])
  async function resend() {
    if (!address || busy || cooldown) return
    setBusy(true)
    setStatus('')
    setNotice('')
    try {
      await address.prepareVerification({ strategy: 'email_code' })
      setCooldown(30)
      setNotice('A new code has been sent. Use the most recent code.')
      setDigits(Array(6).fill(''))
      inputs.current[0]?.focus()
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
        // Suspend the native dialog so Clerk can display its session reverification modal if required.
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
        const verified = address.verification.status === 'verified' ? address : await address.attemptVerification({ code: digits.join('') })
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
      kind="profile-dialog--email"
      steps={
        <div className="profile-email-steps">
          <span className="profile-step-done">1 New email</span>
          <span className="profile-desktop">→</span>
          <span className={step === 'code' ? 'profile-step-current' : ''}>2 Enter code</span>
        </div>
      }
    >
      <form onSubmit={submit}>
        {step === 'email' ? (
          <label className="profile-field">
            New email
            <input
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
        ) : (
          <>
            <p>
              {address?.verification.status === 'verified'
                ? `Your email ${email} is verified. Confirm to finish updating your profile.`
                : `We sent a 6-digit code to ${email}. Your email changes only after you confirm it.`}
            </p>
            <div
              className="profile-code"
              onPaste={(event) => {
                const code = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                if (!code) return
                event.preventDefault()
                setDigits(Array.from({ length: 6 }, (_, index) => code[index] ?? ''))
                inputs.current[Math.min(code.length, 5)]?.focus()
              }}
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputs.current[index] = element
                  }}
                  aria-label={`Verification digit ${index + 1}`}
                  inputMode="numeric"
                  pattern="[0-9]"
                  maxLength={1}
                  required
                  disabled={busy || confirmed || address?.verification.status === 'verified'}
                  value={digit}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, '').slice(-1)
                    setDigits(digits.map((item, position) => (position === index ? value : item)))
                    if (value) inputs.current[index + 1]?.focus()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !digit) inputs.current[index - 1]?.focus()
                    if (event.key === 'ArrowLeft') inputs.current[index - 1]?.focus()
                    if (event.key === 'ArrowRight') inputs.current[index + 1]?.focus()
                  }}
                />
              ))}
            </div>
            <p className="profile-fine">
              Didn’t get it?{' '}
              <button
                type="button"
                className="profile-link"
                disabled={busy || cooldown > 0 || confirmed || address?.verification.status === 'verified'}
                onClick={() => void resend()}
              >
                Resend code{cooldown > 0 ? ` (${cooldown}s)` : ''}
              </button>{' '}
              · Verification is handled by your sign-in provider (Clerk).
            </p>
          </>
        )}
        {notice && (
          <p className="profile-fine" role="status">
            {notice}
          </p>
        )}
        {status && (
          <p className="profile-error" role="status">
            {status}
          </p>
        )}
        <footer>
          <button type="button" className="profile-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="profile-button profile-button--primary"
            type="submit"
            disabled={
              busy || (step === 'code' && !confirmed && address?.verification.status !== 'verified' && digits.join('').length !== 6)
            }
          >
            {busy ? 'Please wait…' : confirmed ? 'Retry sync' : step === 'email' ? 'Continue' : 'Confirm email'}
          </button>
        </footer>
      </form>
    </ProfileDialog>
  )
}
