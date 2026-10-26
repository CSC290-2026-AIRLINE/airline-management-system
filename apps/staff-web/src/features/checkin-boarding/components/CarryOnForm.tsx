import { useState } from 'react'
import type { StaffApi } from '../api/index.ts'
import type { StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import ui from './ui.module.css'
import styles from './CounterPage.module.css'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

export function CarryOnForm({ api, view, onUpdated }: Props) {
  const { carryOn, carryOnCheck } = view
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [error, setError] = useState<string | null>(null)

  const check = async () => {
    const weightKg = numberOrNull(weight)
    const lengthCm = numberOrNull(length)
    const widthCm = numberOrNull(width)
    const heightCm = numberOrNull(height)
    if (weightKg === null || lengthCm === null || widthCm === null || heightCm === null) {
      setError('Enter the weight in kg and the length, width and height in cm.')
      return
    }
    setError(null)
    try {
      onUpdated(await api.carryOn(view.checkIn.id, { weightKg, lengthCm, widthCm, heightCm }))
      setWeight('')
      setLength('')
      setWidth('')
      setHeight('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <section className={ui.panel}>
      <h2 className={ui.sectionTitle}>Carry-on</h2>
      <p className={ui.sub}>
        One bag, up to {carryOn.maxKg} kg and {carryOn.maxLengthCm} × {carryOn.maxWidthCm} × {carryOn.maxHeightCm} cm. Checked at the
        counter or at the gate.
      </p>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className={styles.carryOnForm}>
        <div>
          <label className={ui.label} htmlFor="carryon-weight">
            Weight (kg)
          </label>
          <input
            id="carryon-weight"
            className={ui.input}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="6.2"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="carryon-length">
            Length (cm)
          </label>
          <input
            id="carryon-length"
            className={ui.input}
            inputMode="numeric"
            value={length}
            onChange={(event) => setLength(event.target.value)}
            placeholder="55"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="carryon-width">
            Width (cm)
          </label>
          <input
            id="carryon-width"
            className={ui.input}
            inputMode="numeric"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            placeholder="35"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="carryon-height">
            Height (cm)
          </label>
          <input
            id="carryon-height"
            className={ui.input}
            inputMode="numeric"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            placeholder="22"
          />
        </div>
        <button type="button" className={ui.btnDark} onClick={() => void check()}>
          Check carry-on
        </button>
      </div>

      {carryOnCheck ? (
        <p className={carryOnCheck.result === 'ok' ? ui.sub : ui.sub}>
          {carryOnCheck.result === 'ok' ? 'Within the allowance' : 'Must be checked at the gate'} · {carryOnCheck.weightKg} kg ·{' '}
          {carryOnCheck.withinSize ? 'within the size limit' : 'over the size limit'}
        </p>
      ) : (
        <p className={ui.sub}>The carry-on has not been checked yet.</p>
      )}
    </section>
  )
}
