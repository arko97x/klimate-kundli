import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable' | 'error'

/**
 * Streams the camera into a <video> while `active`. Tracks are always stopped
 * on deactivate/unmount so the camera light goes off as soon as a step is done.
 * getUserMedia needs a secure context: localhost or HTTPS.
 */
export function useCamera(active: boolean, facingMode: 'user' | 'environment' = 'user') {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active) return

    const video = videoRef.current
    let stream: MediaStream | null = null
    let cancelled = false

    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => !cancelled && setStatus('unavailable'))
      return () => {
        cancelled = true
      }
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (video) {
          video.srcObject = s
          await video.play().catch(() => {})
        }
        if (!cancelled) setStatus('live')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('unavailable')
        else setStatus('error')
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
    }
  }, [active, facingMode, attempt])

  const retry = useCallback(() => {
    setStatus('starting')
    setAttempt((n) => n + 1)
  }, [])

  return { videoRef, status, retry }
}

export function cameraMessage(status: CameraStatus): string | null {
  switch (status) {
    case 'denied':
      return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
    case 'unavailable':
      return 'No camera found on this device.'
    case 'error':
      return 'The camera could not start. It may be in use by another app.'
    default:
      return null
  }
}
