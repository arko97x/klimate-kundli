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
        <div className="border-t border-white/10">
          <div className="flex w-full items-center justify-between gap-4 py-4">
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
        </div>
      </footer>
    )
  }

  const { canContinue, onNext, continueLabel = 'Select your birth city' } = props

  return (
    <footer className="w-full shrink-0 bg-transparent">
      <div className="border-t border-white/10">
        <div className="flex w-full justify-end py-4">
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
      </div>
    </footer>
  )
}
