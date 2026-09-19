import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BASE } from './flow'
import { useFlow } from './FlowProvider'
import { parseLinkedInProfile } from './journey'
import { createQrReader } from './qr'
import { CameraFrame } from './CameraFrame'
import { cameraMessage, useCamera } from './useCamera'
import { Panel, PrimaryButton, SecondaryButton, StepShell } from './ui'

const SCAN_INTERVAL_MS = 250
const WRONG_CODE_NOTICE_MS = 3000

export function LinkedInStep() {
  const { state, setLinkedIn } = useFlow()
  const navigate = useNavigate()
  const scanning = state.linkedIn === null
  const { videoRef, status, retry } = useCamera(scanning)
  const [wrongCode, setWrongCode] = useState(false)

  useEffect(() => {
    if (!scanning || status !== 'live') return
    let stopped = false
    let timer: number | undefined
    let clearNotice: number | undefined

    void createQrReader().then((read) => {
      const tick = async () => {
        const video = videoRef.current
        const text = video ? await read(video) : null
        if (stopped) return
        if (text) {
          const profile = parseLinkedInProfile(text)
          if (profile) {
            setLinkedIn(profile)
            return
          }
          setWrongCode(true)
          window.clearTimeout(clearNotice)
          clearNotice = window.setTimeout(() => setWrongCode(false), WRONG_CODE_NOTICE_MS)
        }
        timer = window.setTimeout(tick, SCAN_INTERVAL_MS)
      }
      if (!stopped) void tick()
    })

    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.clearTimeout(clearNotice)
    }
  }, [scanning, status, videoRef, setLinkedIn])

  const handle = state.linkedIn?.replace('https://www.linkedin.com/in/', '')

  return (
    <StepShell
      eyebrow="Step 1 of 4"
      title="Show us your LinkedIn QR code"
      helper={
        scanning
          ? 'In the LinkedIn app, tap the search bar, then the QR icon, and hold your code up to the camera.'
          : 'Got it. This is only used to connect you with your climate matches at DesignUp.'
      }
      primary={
        <PrimaryButton disabled={!state.linkedIn} onClick={() => navigate(`${BASE}/photo`)}>
          Next →
        </PrimaryButton>
      }
      blockedReason={state.linkedIn ? null : 'Scan a LinkedIn profile code to continue.'}
    >
      {scanning ? (
        <CameraFrame
          videoRef={videoRef}
          status={status}
          message={cameraMessage(status)}
          onRetry={retry}
          mirrored
          aspect="aspect-[4/3]"
          // 4:3 box, at most 55% of the screen tall. Wider than the column on
          // laptops, so it only bites on short screens.
          className="mx-auto max-w-[calc(55svh*4/3)]"
          label="Camera view for scanning your LinkedIn QR code"
        >
          <span aria-hidden className="pointer-events-none absolute inset-[18%] border-2 border-white/80" />
          <p
            aria-live="polite"
            className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-sm text-white"
          >
            {status !== 'live'
              ? 'Starting camera…'
              : wrongCode
                ? "That code isn't a LinkedIn profile. Try your profile QR code."
                : 'Looking for a QR code…'}
          </p>
        </CameraFrame>
      ) : (
        <Panel className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-neutral-600">LinkedIn profile</p>
            <p className="truncate text-lg text-black">linkedin.com/in/{handle}</p>
          </div>
          <SecondaryButton onClick={() => setLinkedIn(null)}>Scan again</SecondaryButton>
        </Panel>
      )}
    </StepShell>
  )
}
