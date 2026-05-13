import type { ReactNode } from 'react'

type PageLayoutProps = {
  children?: ReactNode
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <main id="main-content" className="flex flex-1 flex-col touch-manipulation">
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
