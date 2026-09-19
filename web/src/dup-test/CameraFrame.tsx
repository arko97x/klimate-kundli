import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'

import type { CameraStatus } from './useCamera'
import { SecondaryButton } from './ui'

type CameraFrameProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  message: string | null
  onRetry: () => void
  /** Flip the preview like a mirror; the frames the code reads stay unflipped. */
  mirrored?: boolean
  aspect: string
  label: string
  className?: string
  children?: ReactNode
}

/** Live camera box with a permission/error state and a retry action. */
export function CameraFrame({
  videoRef,
  status,
  message,
  onRetry,
  mirrored,
  aspect,
  label,
  className,
  children,
}: CameraFrameProps) {
  return (
    <div className={cn('relative w-full overflow-hidden border border-black bg-neutral-900', aspect, className)}>
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label={label}
        className={cn('absolute inset-0 h-full w-full object-cover', mirrored && '-scale-x-100')}
      />
      {message ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#faf8f3] p-6 text-center">
          <p className="max-w-sm text-base text-black">{message}</p>
          {status !== 'unavailable' && <SecondaryButton onClick={onRetry}>Try again</SecondaryButton>}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
