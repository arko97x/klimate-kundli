import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KundliForm, type KundliSubmit } from "@/components/KundliForm";
import { KundliGrid } from "@/components/KundliGrid";
import { postKundli } from "@/lib/api";
import type { KundliResponse } from "@/lib/types";

type View =
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "result"; result: KundliResponse };

export default function App() {
  const [view, setView] = useState<View>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(s: KundliSubmit) {
    setError(null);
    setView({ kind: "loading" });
    try {
      const result = await postKundli(s);
      setView({ kind: "result", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      setError(message);
      setView({ kind: "form" });
    }
  }

  useEffect(() => {
    if (view.kind === "result") {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [view.kind]);

  return (
    <div className="relative min-h-dvh">
      <header className="border-b border-foreground/15 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/55">
        <div className="container flex h-16 items-center justify-between">
          <a
            href="/"
            className="flex items-baseline gap-2 font-display text-base tracking-tight"
          >
            <span className="font-medium">Klimate Kundli</span>
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              v0.2 · alpha
            </span>
          </a>
          <a
            href="https://github.com/"
            className="font-sans text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            rel="noreferrer"
          >
            About the archive →
          </a>
        </div>
      </header>

      <main className="container py-10 md:py-16">
        {view.kind !== "result" ? (
          <Intro />
        ) : (
          <div
            ref={resultRef}
            className="mb-10 flex items-center justify-between gap-4"
          >
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setView({ kind: "form" });
              }}
              className="font-sans text-xs uppercase tracking-[0.18em]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Start over
            </Button>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              Cast {view.result.elapsedMs} ms · source ERA5
            </p>
          </div>
        )}

        {view.kind === "form" || view.kind === "loading" ? (
          <div className="mx-auto max-w-3xl">
            <KundliForm
              loading={view.kind === "loading"}
              onSubmit={handleSubmit}
              error={error}
            />
          </div>
        ) : (
          <KundliGrid result={view.result} />
        )}
      </main>

      <footer className="border-t border-foreground/15 mt-16">
        <div className="container flex flex-col gap-2 py-8 text-center font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>Klimate Kundli · A climate horoscope for your lifetime.</p>
          <p>
            ERA5 reanalysis · 1990–2020 pilot slice ·{" "}
            <a href="/api/health" className="hover:text-foreground">
              archive status
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// intro — the exhibition placard. Sets the tone before the form.
// ---------------------------------------------------------------------------

function Intro() {
  return (
    <section className="mx-auto mb-12 max-w-3xl space-y-6 text-center">
      <p className="eyebrow">an exhibition piece · enter to begin</p>

      <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
        Tell us when and where
        <br />
        you came into the world.
      </h1>

      <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
        We will draw your <em className="text-foreground">janma kundli</em>
        {" "}— twelve readings of the weather you have lived through. Heat,
        cold, monsoon, sea, carbon. Then and now.
      </p>

      <div className="almanac-rule mx-auto max-w-md" />
    </section>
  );
}
