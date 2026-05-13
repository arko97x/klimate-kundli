import { PageLayout } from '@/components/PageLayout'

function App() {
  return (
    <PageLayout>
      <header className="mb-10 space-y-2 border-b border-border pb-8">
        <p className="text-sm font-medium text-muted-foreground">Dummy preview</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Klimate Kundli
        </h1>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          Placeholder copy so you can see how the centered column reads on narrow and wide
          viewports. Resize the window—the content stays within max width with side margins.
        </p>
      </header>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="min-h-28 rounded-lg border border-dashed border-muted-foreground/35 bg-muted/30"
              aria-hidden
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Wide screen: gray dashed blocks sit inside the same max-width column as the header.
        </p>
      </div>
    </PageLayout>
  )
}

export default App
