import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type WizardLayoutProps = {
  children: ReactNode;
  footer?: ReactNode;
  scrollContent?: boolean;
};

export function WizardLayout({
  children,
  footer,
  scrollContent = false,
}: WizardLayoutProps) {
  const contentScrolls = scrollContent || footer != null

  return (
    <div className="grid min-h-dvh lg:h-dvh lg:max-h-dvh lg:grid-cols-3 lg:overflow-hidden">
      <aside className="flex shrink-0 items-center justify-center bg-muted px-8 py-12 lg:col-span-1 lg:h-full lg:overflow-hidden lg:px-12">
        <div className="max-w-sm space-y-3 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Klimate Kundli
          </h1>
          <p className="text-pretty text-muted-foreground">
            Sima Aunty matches people. We match you to your climate.
          </p>
        </div>
      </aside>

      <div
        className={cn(
          "flex flex-col overflow-hidden bg-background lg:col-span-2 lg:h-full lg:min-h-0",
          footer ? "h-dvh max-h-dvh min-h-0" : "min-h-dvh",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            footer
              ? "overflow-hidden pt-8 pb-0"
              : "px-6 pt-8 pb-0 sm:px-10 lg:px-14",
            !footer && contentScrolls
              ? "justify-start overflow-y-auto"
              : !footer
                ? "justify-center"
                : undefined,
          )}
        >
          {children}
        </div>
        {footer ? (
          <footer className="shrink-0 flex items-center justify-between gap-4 border-t border-border bg-background px-6 py-5 sm:px-10 lg:px-14">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
