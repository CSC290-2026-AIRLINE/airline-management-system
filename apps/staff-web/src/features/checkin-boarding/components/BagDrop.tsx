import { useState } from 'react'
import type { StaffApi } from '../api/index.ts'
import type { StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import { formatBaht } from '../domain/format.ts'
import ui from './ui.module.css'
import styles from './CounterPage.module.css'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

export function BagDrop({ api, view, onUpdated }: Props) {
  const { allowance, bags, totals } = view
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const weigh = async () => {
    const weightKg = numberOrNull(weight)
    const lengthCm = numberOrNull(length)
    const widthCm = numberOrNull(width)
    const heightCm = numberOrNull(height)
    if (weightKg === null || lengthCm === null || widthCm === null || heightCm === null) {
      setError('Enter the weight in kg and the length, width and height in cm.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onUpdated(await api.weighBag(view.checkIn.id, { weightKg, lengthCm, widthCm, heightCm }))
      setWeight('')
      setLength('')
      setWidth('')
      setHeight('')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (bagId: string) => {
    setBusy(true)
    setError(null)
    try {
      onUpdated(await api.removeBag(bagId))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const tag = async (bagId: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.tagBag(bagId)
      onUpdated(result.view)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={ui.panel}>
      <h2 className={ui.sectionTitle}>Bag drop</h2>
      <p className={ui.sub}>
        Free allowance {allowance.freeKg} kg + {allowance.tierBonusKg} kg tier bonus · {formatBaht(allowance.ratePerKg)} per extra kg · max{' '}
        {allowance.maxBagKg} kg and {allowance.maxLinearCm} cm of length, width and height together
      </p>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className={styles.weighForm}>
        <div>
          <label className={ui.label} htmlFor="bag-weight">
            Weight (kg)
          </label>
          <input
            id="bag-weight"
            className={ui.input}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="23.4"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="bag-length">
            Length (cm)
          </label>
          <input
            id="bag-length"
            className={ui.input}
            inputMode="numeric"
            value={length}
            onChange={(event) => setLength(event.target.value)}
            placeholder="70"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="bag-width">
            Width (cm)
          </label>
          <input
            id="bag-width"
            className={ui.input}
            inputMode="numeric"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            placeholder="40"
          />
        </div>
        <div>
          <label className={ui.label} htmlFor="bag-height">
            Height (cm)
          </label>
          <input
            id="bag-height"
            className={ui.input}
            inputMode="numeric"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            placeholder="25"
          />
        </div>
        <button type="button" className={ui.btnDark} disabled={busy} onClick={() => void weigh()}>
          Weigh bag
        </button>
      </div>

      {bags.length === 0 ? (
        <p className={ui.sub}>No bag weighed yet.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Bag</th>
                <th>Weight</th>
                <th>Excess</th>
                <th>Fee</th>
                <th>Tag</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bags.map((bag, index) => (
                <tr key={bag.id}>
                  <td>{index + 1}</td>
                  <td>{bag.weightKg} kg</td>
                  <td>{bag.excessKg} kg</td>
                  <td>{bag.excessFee > 0 ? formatBaht(bag.excessFee) : '—'}</td>
                  <td className={ui.mono}>{bag.tagNumber ?? '—'}</td>
                  <td>
                    <div className={ui.row}>
                      <button
                        type="button"
                        className={ui.btnGhost}
                        disabled={busy || bag.status === 'tagged'}
                        onClick={() => void remove(bag.id)}
                      >
                        Remove
                      </button>
                      <button type="button" className={ui.btn} disabled={busy || bag.status === 'tagged'} onClick={() => void tag(bag.id)}>
                        {totals.unpaidFee > 0 ? `Pay ${formatBaht(totals.unpaidFee)} and print tag` : 'Print tag'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={ui.sub}>
        Total {totals.weightKg} kg · excess {totals.excessKg} kg · unpaid {formatBaht(totals.unpaidFee)}
      </p>
    </section>
  )
}
