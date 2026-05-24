import type { ReactNode } from 'react'

type DocLayoutProps = {
  children: ReactNode
}

export function DocLayout({ children }: DocLayoutProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16 lg:px-10">
        <article className="doc-prose">{children}</article>
      </main>
    </div>
  )
}
