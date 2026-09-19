import type { CSSProperties } from 'react'

import { Star } from '@/expt/KundliWizardLayout'

import { TWINKLE_TIMING } from './twinkle'

type TwinklingStarProps = {
  /** Picks this star's cycle from TWINKLE_TIMING, so neighbours don't sync. */
  index: number
  /** Visibility and colour classes, e.g. "hidden xl:block text-white". */
  className?: string
  /** Position and size: left, top, width. The star centres on left/top. */
  style: CSSProperties
}

/**
 * A four-point star that rests visible and twinkles now and then. Needs
 * TWINKLE_CSS on the page.
 */
export function TwinklingStar({ index, className, style }: TwinklingStarProps) {
  const [dur, first] = TWINKLE_TIMING[index % TWINKLE_TIMING.length]
  return (
    <div
      className={`${className ?? ''} dup-star absolute -translate-x-1/2 -translate-y-1/2`}
      style={{
        ...style,
        aspectRatio: '105/116',
        ['--twinkle-dur' as string]: `${dur}s`,
        ['--twinkle-delay' as string]: `${first}s`,
      }}
    >
      <Star className="dup-star-main absolute inset-0 h-full w-full" />
      <Star className="dup-star-glint absolute inset-0 h-full w-full" />
    </div>
  )
}
