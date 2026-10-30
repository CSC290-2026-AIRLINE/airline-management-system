import { useEffect, useRef } from 'react'
import type { BoardingPassView } from '../api/types.ts'
import { formatDay, formatTime } from '../format.ts'
import flow from './flow.module.css'
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

export function BoardingPassStep({ pass, onStartOver }: { pass: BoardingPassView; onStartOver: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvas.current) drawPseudoQr(canvas.current, pass.qrPayload)
  }, [pass.qrPayload])

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>You are checked in</h2>
      <p className={styles.hint}>Show this pass at the gate. Your bag tag is printed at the counter.</p>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.brand}>Flython</span>
          <span className={styles.reference}>{pass.reference}</span>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.fields}>
            <p className={styles.name}>{pass.passengerName}</p>
            <div className={styles.route}>
              <span className={styles.code}>{pass.origin}</span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
              <span className={styles.code}>{pass.destination}</span>
            </div>
            <dl className={styles.grid}>
              <div>
                <dt>Flight</dt>
                <dd>{pass.flightNumber}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDay(pass.date)}</dd>
              </div>
              <div>
                <dt>Departs</dt>
                <dd>{formatTime(pass.depAt)}</dd>
              </div>
              <div>
                <dt>Boarding</dt>
                <dd>{formatTime(pass.boardingAt)}</dd>
              </div>
              <div>
                <dt>Seat</dt>
                <dd>{pass.seat}</dd>
              </div>
              <div>
                <dt>Gate</dt>
                <dd>{pass.gate ?? 'TBC'}</dd>
              </div>
              <div>
                <dt>Boarding group</dt>
                <dd>{pass.boardingGroup}</dd>
              </div>
              <div>
                <dt>Checked bags</dt>
                <dd>{pass.bags}</dd>
              </div>
            </dl>
          </div>

          <canvas ref={canvas} className={styles.qr} role="img" aria-label={`Boarding pass code ${pass.reference}`} />
        </div>
      </div>

      <div className={styles.actions}>
        <button className={flow.ghostButton} type="button" onClick={() => downloadWalletPass(pass)}>
          Add to wallet
        </button>
        <button className={flow.button} type="button" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </div>
  )
}
