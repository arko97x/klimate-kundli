import type { ReactNode } from 'react'

import { KundliCreaseBackground } from '@/expt/KundliCreaseBackground'
import { Header } from '@/expt/Header'

type KundliResultLayoutProps = {
  children: ReactNode
  /** Right-side header actions (e.g. Print + New Kundli on a slug page). */
  headerActions?: ReactNode
}

export function KundliResultLayout({ children, headerActions }: KundliResultLayoutProps) {
  return (
    <div className="relative min-h-dvh bg-white text-black">
      <KundliCreaseBackground />
      {/* Public header; renders nothing on exhibition slug pages. */}
      <Header actions={headerActions} />
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <main>{children}</main>
      </div>
    </div>
  )
}
