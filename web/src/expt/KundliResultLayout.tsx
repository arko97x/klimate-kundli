import type { ReactNode } from 'react'

import { Header } from '@/expt/Header'

type KundliResultLayoutProps = {
  children: ReactNode
}

export function KundliResultLayout({ children }: KundliResultLayoutProps) {
  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>
      </div>
    </div>
  )
}
