import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Message } from './pills.tsx'
import { referenceFromQr } from './camera-scan.ts'

/** Ten decodes a second is plenty for a pass held up to a webcam and keeps the laptop quiet. */
const FRAME_MS = 100
/** A pass already read is ignored this long: time enough for the passenger to lower the phone after "Scan next". */
const IGNORE_SAME_MS = 3000

/**
 * The webcam view of the gate: while active it streams the default camera and calls `onDecode` for every frame
 * whose QR code is a boarding-pass reference. Camera problems are shown here, never thrown.
 */
export function CameraScan({ active, onDecode }: { active: boolean; onDecode: (reference: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const decode = useRef(onDecode)
  /** The last pass read and when, so a phone still in frame after "Scan next" is not read again at once. */
  const last = useRef<{ reference: string; at: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Plain http on a LAN address has no mediaDevices at all; only HTTPS and localhost do.
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    decode.current = onDecode
  })

  useEffect(() => {
    const element = video.current
    if (!active || !supported || !element) return
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    const canvas = document.createElement('canvas')

    const readFrame = () => {
      if (element.readyState < 2) return
      canvas.width = element.videoWidth
      canvas.height = element.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0) return
      ctx.drawImage(element, 0, 0)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
      const reference = code ? referenceFromQr(code.data) : null
      if (!reference) return
      const now = Date.now()
      if (last.current?.reference === reference && now - last.current.at < IGNORE_SAME_MS) return
      // One read per activation: the loop stops here, before the parent re-renders, so a slow frame cannot fire twice.
      if (timer) clearInterval(timer)
      timer = null
      last.current = { reference, at: now }
      decode.current(reference)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 } }, audio: false })
      .then(async (media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        element.srcObject = media
        await element.play()
        if (cancelled) return
        setError(null)
        timer = setInterval(readFrame, FRAME_MS)
      })
      .catch((err: unknown) => {
        // The stream may already be open when play() refuses: the camera is not left running behind an error.
        stream?.getTracks().forEach((track) => track.stop())
        if (!cancelled) setError(`Camera unavailable: ${err instanceof Error ? err.message : String(err)}. Type the reference instead.`)
      })

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      element.srcObject = null
    }
  }, [active, supported])

  if (!active) return null
  if (!supported) {
    return (
      <Message tone="error">This browser cannot use the camera here (it needs HTTPS or localhost). Type the reference instead.</Message>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <video
        ref={video}
        muted
        playsInline
        aria-label="Camera view for scanning boarding passes"
        className="w-full max-w-[480px] rounded-[10px] border border-[#dbe2ea] bg-black"
      />
      {error ? <Message tone="error">{error}</Message> : null}
    </div>
  )
}
