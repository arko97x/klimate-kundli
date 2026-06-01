import type { ReactElement } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type DisabledTooltipProps = {
  disabled: boolean
  content: string | null | undefined
  children: ReactElement
  className?: string
}

export function DisabledTooltip({
  disabled,
  content,
  children,
  className,
}: DisabledTooltipProps) {
  if (!disabled || !content) {
    return children
  }

  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        className={cn('inline-flex cursor-not-allowed', className)}
        render={<span />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  )
}
