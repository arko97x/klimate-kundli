// Thin wrapper around the Umami tracker injected in main.tsx (production
// builds only). In dev, or if the script is blocked, window.umami is absent
// and calls no-op. Simple button clicks don't need this — tag them with a
// data-umami-event attribute instead; this is for outcomes that aren't
// clicks (e.g. "a kundli was actually created").

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void
    }
  }
}

export function track(event: string, data?: Record<string, unknown>): void {
  window.umami?.track(event, data)
}
