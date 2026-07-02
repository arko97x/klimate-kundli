import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

type ShareQrCodeProps = {
  /** The absolute URL to encode. Directly-encoded, so it never expires or hits a scan limit. */
  url: string
  /** Rendered pixel size of the square QR. */
  size?: number
}

/**
 * Renders a QR code for a kundli's shareable link. The URL is encoded directly
 * into the QR (not via a redirect service), so scanning it has no limit and it
 * keeps working as long as the page exists.
 */
export function ShareQrCode({ url, size = 160 }: ShareQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size * 2, // render at 2x for crisp display / print
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((src) => {
        if (!cancelled) {
          setDataUrl(src)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, size])

  if (!dataUrl) {
    return null
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
      <img
        src={dataUrl}
        width={size}
        height={size}
        alt="QR code linking to this climate kundli"
        className="rounded-md"
      />
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Scan to open this kundli on your phone
      </p>
    </div>
  )
}
