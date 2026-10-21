import { useEffect, useRef, useState, type FormEvent } from 'react'
import ProfileDialog from './ProfileDialog'

// No verification or account update is simulated. Clerk must supply the real email flow.
export default function ChangeEmailDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [status, setStatus] = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => {
    if (step === 'code') inputs.current[0]?.focus()
  }, [step])
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 'email') {
      setStep('code')
      setStatus('Preview only: no code has been sent. Email verification is not connected yet.')
      return
    }
    setStatus('Email has not changed. Connect Clerk verification to confirm a real code.')
  }
  return (
    <ProfileDialog
      title={step === 'email' ? 'Change email' : 'Check your new email'}
      onClose={onClose}
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
        ) : (
          <>
            <p>
              Enter the 6-digit code for <strong>{email}</strong>. Your email changes only after verification.
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
            <button
              type="button"
              className="profile-link"
              onClick={() => setStatus('No code was sent. Email verification is not connected yet.')}
            >
              Resend code
            </button>
          </>
        )}
        {status && (
          <p className="profile-error" role="status">
            {status}
          </p>
        )}
        <footer>
          <button type="button" className="profile-button" onClick={onClose}>
            Cancel
          </button>
          <button className="profile-button profile-button--primary" type="submit">
            {step === 'email' ? 'Continue' : 'Confirm email'}
          </button>
        </footer>
      </form>
    </ProfileDialog>
  )
}
