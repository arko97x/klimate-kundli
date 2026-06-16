import type { ReactNode } from 'react'

import { Header } from '@/expt/Header'

type KundliResultLayoutProps = {
  children: ReactNode
}

export function KundliResultLayout({ children }: KundliResultLayoutProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Header />
        <main>{children}</main>
      </div>
    </div>
  )
}
