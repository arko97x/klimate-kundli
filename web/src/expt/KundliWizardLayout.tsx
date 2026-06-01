import type { ReactNode } from 'react'

import { CyclingTagline } from '@/expt/CyclingTagline'
import { Header } from '@/expt/Header'
import { KundliArtBackground } from '@/expt/KundliArtBackground'

import './stamp.css'

type KundliWizardLayoutProps = {
  children: ReactNode
  footer: ReactNode
}

export function KundliWizardLayout({ children, footer }: KundliWizardLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Header />

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[2fr_3fr] lg:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col lg:contents">
            <aside className="kk-kundli-panel relative flex min-h-0 w-full flex-1 flex-col items-stretch justify-center overflow-hidden p-6 sm:p-8 lg:h-full lg:overflow-hidden">
              <KundliArtBackground />
              <div className="relative z-10 flex w-full flex-col items-stretch justify-center text-white">
                <div className="kk-stamp">
                  <img
                    src="/kk-logo-beta.svg"
                    alt="Klimate Kundli (Beta)"
                    className="kk-stamp__art"
                  />
                </div>
                <CyclingTagline />
              </div>
            </aside>
          </div>

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:h-full lg:min-h-0">
            {children}
            {footer}
          </main>
        </div>
      </div>
    </div>
  )
}
