import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { LinenPaper } from "@/components/LinenPaper";
import { Button } from "@/components/ui/button";
import { PrintedInk } from "@/components/PrintedInk";
import { TwinklingStar } from "@/dup-test/TwinklingStar";
import { TWINKLE_CSS } from "@/dup-test/twinkle";
import parrotUrl from "@/assets/parrot-white.svg";

// Shapes and star positions mirror the landing composition in
// KundliWizardLayout: a full-width box at 1:1 (mobile), 2:1 (sm), 3:1 (xl).

const DIAMOND: CSSProperties = {
  clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
};

// [left, top, width, colour class]
type StarSpec = [string, string, string, string];

const TABLET_STARS: StarSpec[] = [
  ["14.5%", "37%", "6.5%", "text-white"],
  ["22%", "60%", "3.5%", "text-neutral-400"],
  ["8%", "90%", "2.5%", "text-black"],
  ["25%", "86%", "4.5%", "text-neutral-400"],
  ["78%", "23%", "4.5%", "text-neutral-600"],
  ["83%", "31%", "2.2%", "text-white"],
  ["71%", "65%", "4.2%", "text-neutral-300"],
  ["78%", "79%", "4.5%", "text-neutral-500"],
  ["93%", "92%", "2.5%", "text-neutral-300"],
];

const DESKTOP_STARS: StarSpec[] = [
  ["18%", "37%", "6.5%", "text-white"],
  ["28%", "60%", "3.5%", "text-neutral-400"],
  ["10%", "90%", "2.5%", "text-black"],
  ["33.333%", "86%", "4.5%", "text-neutral-400"],
  ["66.667%", "23%", "4.5%", "text-neutral-600"],
  ["82%", "31%", "2.2%", "text-white"],
  ["62%", "65%", "4.2%", "text-neutral-300"],
  ["66.667%", "79%", "4.5%", "text-neutral-500"],
  ["90%", "92%", "2.5%", "text-neutral-300"],
];

// Vertical grid lines: [left, visibility classes]. Right edge sits at
// calc(100% - 1px) to match the landing page's right-0 line.
const GRID_LINES: [string, string][] = [
  ["0", ""],
  ["50%", ""],
  ["calc(100% - 1px)", ""],
  ["25%", "hidden sm:block xl:hidden"],
  ["75%", "hidden sm:block xl:hidden"],
  ["16.667%", "hidden xl:block"],
  ["33.333%", "hidden xl:block"],
  ["66.667%", "hidden xl:block"],
  ["83.333%", "hidden xl:block"],
];

function Stars({ stars, className }: { stars: StarSpec[]; className: string }) {
  return stars.map(([left, top, width, color], i) => (
    <TwinklingStar
      key={`${left}-${top}`}
      index={i}
      className={`${className} ${color}`}
      style={{ left, top, width }}
    />
  ));
}

export function DupTestPage() {
  const navigate = useNavigate();
  return (
    <LinenPaper className="relative h-dvh overflow-hidden">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Almendra+SC&display=swap');${TWINKLE_CSS}`}</style>
      <PrintedInk
        className="h-full w-full"
        crisp={
          // Twinkling stars stay out of the edge-bleed filter (see PrintedInk).
          <div className="relative mx-auto mt-8 aspect-square w-full sm:mt-0 sm:aspect-[2/1] xl:aspect-[3/1]">
            <Stars stars={TABLET_STARS} className="hidden sm:block xl:hidden" />
            <Stars stars={DESKTOP_STARS} className="hidden xl:block" />
          </div>
        }
      >
        {/* Full-height vertical grid lines, behind the shapes */}
        <div className="pointer-events-none absolute inset-0">
          {GRID_LINES.map(([left, visibility]) => (
            <div
              key={`${left}-${visibility}`}
              className={`absolute inset-y-0 w-px bg-neutral-200 ${visibility}`}
              style={{ left }}
            />
          ))}
        </div>

        <div className="relative mx-auto mt-8 aspect-square w-full sm:mt-0 sm:aspect-[2/1] xl:aspect-[3/1]">
          {/* Left: half-triangle (sm), full diamond (xl) */}
          <div
            className="absolute left-0 top-0 hidden h-full w-1/4 bg-black sm:block xl:hidden"
            style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%)" }}
          />
          <div className="absolute left-0 top-0 hidden h-full w-1/3 bg-black xl:block" style={DIAMOND} />

          {/* Right: half-triangle (sm), full diamond (xl) */}
          <div
            className="absolute right-0 top-0 hidden h-full w-1/4 bg-black sm:block xl:hidden"
            style={{ clipPath: "polygon(100% 0, 0 50%, 100% 100%)" }}
          />
          <div
            className="absolute top-0 hidden h-full w-1/3 bg-black xl:block"
            style={{ ...DIAMOND, left: "66.667%" }}
          />

          {/* Centre gradient diamond */}
          <div
            className="absolute left-0 right-0 top-0 flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#180033] to-[#bd005d] p-4 sm:left-1/4 sm:right-1/4 xl:left-1/3 xl:right-1/3"
            style={DIAMOND}
          >
            <h1
              className="text-center text-4xl font-normal leading-tighter tracking-wider text-white sm:text-5xl xl:text-6xl"
              style={{ fontFamily: "'Almendra SC', serif" }}
            >
              Klimate
              <br />
              Kundli
            </h1>
          </div>

        </div>

        {/* Get Started, pinned to the screen bottom as on the landing page */}
        <div className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 flex-col items-center">
          {/* White parrot perched on the button */}
          <div className="relative z-10 aspect-[215/257] w-[115px] -translate-x-[80%] translate-y-[32%] xl:w-[130px] xl:-translate-x-[95%]">
            <img src={parrotUrl} alt="Parrot" className="h-full w-full" />
          </div>
          <Button onClick={() => navigate("/dup-test/linkedin")} className="h-[44px] w-[180px] rounded-none bg-black text-xs font-semibold uppercase tracking-wider text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-black/90 sm:h-[52px] sm:w-[240px] sm:text-sm xl:text-base">
            Get Started
          </Button>
        </div>
      </PrintedInk>
    </LinenPaper>
  );
}
