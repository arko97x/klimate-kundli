import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { DisabledTooltip } from '@/components/DisabledTooltip'
import { Button } from '@/components/ui/button'

type ContinueFooterProps = {
  mode: 'continue'
  canContinue: boolean
  onNext: () => void
  continueLabel?: string
}

type GenerateFooterProps = {
  mode: 'generate'
  onBack: () => void
  onGenerate: () => void
  generating?: boolean
  canGenerate?: boolean
  generateDisabledReason?: string | null
}

export type FooterProps = ContinueFooterProps | GenerateFooterProps

export function Footer(props: FooterProps) {
  if (props.mode === 'generate') {
    const {
      onBack,
      onGenerate,
      generating = false,
      canGenerate = false,
      generateDisabledReason = null,
    } = props
    const generateDisabled = !canGenerate || generating
    const generateTooltip = generating ? 'Generating…' : generateDisabledReason

    return (
      <footer className="w-full shrink-0 bg-transparent">
        <div className="relative border-t border-purple-950/20 dark:border-white/40 -mx-3 sm:-mx-6">
          <div className="flex w-full items-center justify-between gap-4 px-3 sm:px-6 py-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onBack}
              aria-label="Back"
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <DisabledTooltip disabled={generateDisabled} content={generateTooltip}>
              <Button
                type="button"
                className="min-w-44 px-8"
                disabled={generateDisabled}
                onClick={onGenerate}
              >
                {generating ? 'Generating…' : 'Generate Kundli'}
              </Button>
            </DisabledTooltip>
          </div>
          {/* Divider horizontal extensions */}
          <div className="absolute top-[-1px] right-full w-screen h-px bg-purple-950/10 dark:bg-white/15 pointer-events-none" />
          <div className="absolute top-[-1px] left-full w-screen h-px bg-purple-950/10 dark:bg-white/15 pointer-events-none" />
        </div>
      </footer>
    )
  }

  const { canContinue, onNext, continueLabel = 'Select your birth city' } = props

  return (
    <footer className="w-full shrink-0 bg-transparent">
      <div className="relative border-t border-purple-950/20 dark:border-white/40 -mx-3 sm:-mx-6">
        <div className="flex w-full justify-end px-3 sm:px-6 py-4">
          <DisabledTooltip disabled={!canContinue} content={continueLabel}>
            <Button
              type="button"
              size="icon"
              disabled={!canContinue}
              onClick={onNext}
              aria-label="Continue"
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </DisabledTooltip>
        </div>
        {/* Divider horizontal extensions */}
        <div className="absolute top-[-1px] right-full w-screen h-px bg-purple-950/10 dark:bg-white/15 pointer-events-none" />
        <div className="absolute top-[-1px] left-full w-screen h-px bg-purple-950/10 dark:bg-white/15 pointer-events-none" />
      </div>
    </footer>
  )
}
