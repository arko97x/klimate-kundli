import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { BASE } from './flow'
import { useFlow } from './FlowProvider'
import { CameraFrame } from './CameraFrame'
import { DITHER_HEIGHT, DITHER_WIDTH, ditherFrame } from './dither'
import { cameraMessage, useCamera } from './useCamera'
import { PrimaryButton, SecondaryButton, StepShell } from './ui'

export function PhotoStep() {
  const { state, setPhoto } = useFlow()
  const navigate = useNavigate()
  const live = state.photo === null
  const { videoRef, status, retry } = useCamera(live)
  const outRef = useRef<HTMLCanvasElement>(null)

  // Re-dither every animation frame while the camera is live.
  useEffect(() => {
    if (!live || status !== 'live') return
    const out = outRef.current?.getContext('2d')
    const workCanvas = document.createElement('canvas')
    workCanvas.width = DITHER_WIDTH
    workCanvas.height = DITHER_HEIGHT
    const work = workCanvas.getContext('2d', { willReadFrequently: true })
    if (!out || !work) return

    let raf = 0
    const draw = () => {
      const video = videoRef.current
      if (video && video.readyState >= 2) ditherFrame(video, work, out)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [live, status, videoRef])

  const capture = () => {
    // Only the dithered canvas is kept. The raw frame never leaves the video
    // element, and the camera stops as soon as `photo` is set.
    const dataUrl = outRef.current?.toDataURL('image/png')
    if (dataUrl) setPhoto(dataUrl)
  }

  const pixelated = 'h-full w-full [image-rendering:pixelated]'

  return (
    <StepShell
      eyebrow="Step 2 of 4"
      title={live ? 'Now, a portrait' : 'Your portrait'}
      helper={
        live
          ? 'Look at the camera. Only the dotted version on the right is kept; the camera image is never saved.'
          : 'This dotted portrait is all that is kept. The camera image was discarded.'
      }
      back={<SecondaryButton onClick={() => navigate(`${BASE}/linkedin`)}>← Back</SecondaryButton>}
      primary={
        live ? (
          <PrimaryButton disabled={status !== 'live'} onClick={capture}>
            Capture
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => navigate(`${BASE}/birth`)}>Next →</PrimaryButton>
        )
      }
      blockedReason={live && status === 'starting' ? 'Waiting for the camera…' : null}
    >
      {live ? (
        // Two 4:5 columns, each at most 50% of the screen tall (width 40svh), plus
        // the gap. Wider than the column on laptops, so it only bites on short screens.
        <div className="mx-auto grid w-full max-w-[calc(80svh+1rem)] grid-cols-2 gap-3 sm:gap-4">
          <figure className="flex flex-col gap-2">
            <CameraFrame
              videoRef={videoRef}
              status={status}
              message={cameraMessage(status)}
              onRetry={retry}
              mirrored
              aspect="aspect-[4/5]"
              label="Live camera view"
            />
            <figcaption className="text-sm text-neutral-600">Camera · not saved</figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <div className="aspect-[4/5] w-full border border-black">
              <canvas
                ref={outRef}
                width={DITHER_WIDTH}
                height={DITHER_HEIGHT}
                role="img"
                aria-label="Live dotted version of your portrait"
                className={pixelated}
              />
            </div>
            <figcaption className="text-sm text-neutral-600">What's kept</figcaption>
          </figure>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="aspect-[4/5] w-44 border border-black sm:w-56">
            <img src={state.photo!} alt="Your dotted portrait" className={pixelated} />
          </div>
          <SecondaryButton onClick={() => setPhoto(null)}>Retake</SecondaryButton>
        </div>
      )}
    </StepShell>
  )
}
