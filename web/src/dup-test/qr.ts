import jsQR from 'jsqr'

// Minimal typing for the Shape Detection API, which TypeScript's DOM lib
// doesn't ship yet.
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
type BarcodeDetectorCtor = {
  new (options: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

const MAX_SCAN_WIDTH = 640

/**
 * Returns a function that reads a QR code from the current video frame, or
 * null if there isn't one. Uses the native BarcodeDetector where it supports
 * QR (Chromium on Android and macOS), else jsQR.
 */
export async function createQrReader(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ['qr_code']
      if (formats.includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] })
        return async (video) => {
          const codes = await detector.detect(video).catch(() => [])
          return codes[0]?.rawValue ?? null
        }
      }
    } catch {
      // fall through to jsQR
    }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!ctx || !vw || !vh) return null
    const scale = Math.min(1, MAX_SCAN_WIDTH / vw)
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.round(vh * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  }
}
