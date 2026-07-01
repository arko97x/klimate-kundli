import type { ReactNode } from 'react'

import { KundliCreaseBackground } from '@/expt/KundliCreaseBackground'

type KundliResultLayoutProps = {
  children: ReactNode
}

export function KundliResultLayout({ children }: KundliResultLayoutProps) {
  return (
    <div className="relative min-h-dvh bg-white text-black">
      <KundliCreaseBackground />
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <main>{children}</main>
      </div>
    </div>
  )
}
