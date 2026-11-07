import { useEffect, useRef } from 'react'
import type { BoardingPassView } from '../api/types.ts'
import { formatDay, formatTime } from '../format.ts'
import flow from './flow.module.css'
import { Message } from './Message.tsx'
import styles from './pass.module.css'

/** The pass card shows a pseudo QR drawn from the reference, exactly like the prototype. */
function drawPseudoQr(canvas: HTMLCanvasElement, text: string) {
  const n = 25
  const px = 5
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = canvas.height = n * px
  let h = 2166136261
  for (const c of text) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  const rnd = () => {
    h ^= h << 13
    h >>>= 0
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h / 4294967296
  }
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, n * px, n * px)
  ctx.fillStyle = '#14213D'
  const finder = (x: number, y: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || j === 0 || i === 6 || j === 6
        const core = i > 1 && i < 5 && j > 1 && j < 5
        if (edge || core) ctx.fillRect((x + i) * px, (y + j) * px, px, px)
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const inFinder = (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9)
      if (!inFinder && rnd() > 0.52) ctx.fillRect(i * px, j * px, px, px)
    }
  }
  finder(0, 0)
  finder(n - 7, 0)
  finder(0, n - 7)
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
    if (canvas.current) drawPseudoQr(canvas.current, pass.qrPayload)
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
