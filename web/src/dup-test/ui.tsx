import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Shared building blocks for the flow. Visual language follows the live
// wizard: black square actions, hairline neutral borders, Alegreya Sans.

const BUTTON_BASE =
  'inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-none px-6 text-sm font-semibold uppercase tracking-wider transition-[transform,background-color,color] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:active:scale-100'

export function PrimaryButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        BUTTON_BASE,
        'bg-black text-white hover:bg-black/85 disabled:bg-neutral-300 disabled:text-neutral-600',
        className,
      )}
      {...props}
    />
  )
}

export function SecondaryButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        BUTTON_BASE,
        'border border-neutral-400 bg-transparent text-black hover:border-black disabled:text-neutral-400',
        className,
      )}
      {...props}
    />
  )
}

/** Small inline text action, e.g. "Change city". Still a 44px touch target. */
export function TextButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 touch-manipulation items-center text-sm text-neutral-700 underline underline-offset-4 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
        className,
      )}
      {...props}
    />
  )
}

// On narrow screens and short (landscape phone) screens the actions become a
// bar fixed to the bottom edge, so the primary action is always reachable.
// Laptops and tablets keep them in normal flow under the question.
// FlowLayout pads <main> by the bar's height on the same screens.
const PINNED_ACTIONS = [
  'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-10 max-sm:border-t max-sm:border-neutral-300 max-sm:bg-[#faf8f3] max-sm:px-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:pt-3',
  '[@media(max-height:500px)]:fixed [@media(max-height:500px)]:inset-x-0 [@media(max-height:500px)]:bottom-0 [@media(max-height:500px)]:z-10 [@media(max-height:500px)]:border-t [@media(max-height:500px)]:border-neutral-300 [@media(max-height:500px)]:bg-[#faf8f3] [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))] [@media(max-height:500px)]:pt-2',
].join(' ')

type StepShellProps = {
  /** Small label above the question, e.g. "Step 1 of 4". */
  eyebrow?: string
  title: string
  helper?: ReactNode
  children?: ReactNode
  /** Back action, left. */
  back?: ReactNode
  /** Primary action, right. */
  primary?: ReactNode
  /** Why the primary action is unavailable, shown next to it. */
  blockedReason?: string | null
}

/**
 * One question per screen. The heading takes focus on arrival so screen
 * readers announce the new question after each transition.
 */
export function StepShell({ eyebrow, title, helper, children, back, primary, blockedReason }: StepShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [title])

  return (
    <section className="flex flex-col gap-6">
      {/* Entry animation sits on the content and the actions separately: a
          transform on an ancestor would make the fixed phone bar jump. */}
      <div className="dup-enter flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          {eyebrow && <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">{eyebrow}</p>}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-sans text-2xl leading-tight text-black outline-none sm:text-3xl"
          >
            {title}
          </h1>
          {helper && <div className="text-base leading-relaxed text-neutral-700">{helper}</div>}
        </header>

        {children}
      </div>

      {(back || primary) && (
        <div className={cn('dup-enter dup-actions flex flex-col gap-3 pt-2', PINNED_ACTIONS)}>
          {/* 34rem = main's max-w-xl minus its padding, so the fixed bar's
              buttons line up with the column above. */}
          <div className="mx-auto flex w-full max-w-[34rem] flex-wrap items-center justify-between gap-3">
            <div>{back}</div>
            <div className="ml-auto">{primary}</div>
          </div>
          {blockedReason && (
            <p className="mx-auto w-full max-w-[34rem] text-right text-sm text-neutral-600" aria-live="polite">
              {blockedReason}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** Hairline panel matching the live wizard's bordered input panel. */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('border border-neutral-300 bg-white/70 p-4 sm:p-5', className)} {...props} />
}
