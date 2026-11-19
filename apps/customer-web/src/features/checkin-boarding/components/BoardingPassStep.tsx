import { useEffect, useRef } from 'react'
import type { BoardingPassView } from '../api/types.ts'
import { qrModules } from '../domain/qr.ts'
import { formatDay, formatTime } from '../format.ts'
import flow from './flow.module.css'
import { Message } from './Message.tsx'
import styles from './pass.module.css'

/** A scannable QR of the pass reference: black on white with the 4-module quiet zone scanners expect. */
function drawQr(canvas: HTMLCanvasElement, text: string) {
  const modules = qrModules(text)
  const quiet = 4
  const px = 8
  const size = (modules.length + quiet * 2) * px
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = canvas.height = size
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#000'
  modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px)
    })
  })
}

function downloadWalletPass(pass: BoardingPassView) {
  const blob = new Blob([JSON.stringify(pass.walletPass, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `boarding-pass-${pass.reference}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** The pass prints the surname first: ERIKSSON/ANNA. */
function passengerLabel(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts.shift()
  if (!first || parts.length === 0) return name.toUpperCase()
  return `${parts.join(' ').toUpperCase()}/${first.toUpperCase()}`
}

export function BoardingPassStep({ pass, onStartOver }: { pass: BoardingPassView; onStartOver: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvas.current) drawQr(canvas.current, pass.qrPayload)
  }, [pass.qrPayload])

  const fields: Array<[string, string]> = [
    ['Passenger', passengerLabel(pass.passengerName)],
    ['Flight', pass.flightNumber],
    ['Date', formatDay(pass.date)],
    ['Seat', pass.seat],
    ['Gate', pass.gate ?? 'TBC'],
    ['Boarding', formatTime(pass.boardingAt)],
    ['Bags', String(pass.bags)],
    ['Reference', pass.reference],
  ]

  return (
    <div className={styles.wrap}>
      <Message tone="success">
        <strong>You&apos;re checked in.</strong> Your boarding pass was also sent to your email (Feature 13).
      </Message>

      <div className={styles.card}>
        <div className={styles.main}>
          <div className={styles.cardHead}>
            <span className={styles.brand}>
              Flython
              <span className={styles.brandSub}>AIRLINES</span>
            </span>
            <span className={styles.pill}>Boarding group {pass.boardingGroup}</span>
          </div>

          <div className={styles.route}>
            <span className={styles.city}>
              <span className={styles.code}>{pass.origin}</span>
              <span className={styles.cityName}>{pass.originCity}</span>
            </span>
            <span className={styles.planeLine}>
              <span className={styles.plane} aria-hidden="true">
                &#9992;
              </span>
            </span>
            <span className={styles.city}>
              <span className={styles.code}>{pass.destination}</span>
              <span className={styles.cityName}>{pass.destinationCity}</span>
            </span>
          </div>

          <dl className={styles.grid}>
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={styles.qrPanel}>
          <canvas ref={canvas} className={styles.qr} role="img" aria-label={`Boarding pass code ${pass.reference}`} />
          <span className={styles.qrCaption}>QR holds the reference only</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={flow.button} type="button" onClick={() => downloadWalletPass(pass)}>
          Add to wallet
        </button>
        <button className={flow.ghostButton} type="button" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </div>
  )
}
