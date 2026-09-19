import type { CSSProperties } from "react";

import { LinenPaper } from "@/components/LinenPaper";
import { PrintedInk } from "@/components/PrintedInk";
import { Star } from "@/expt/KundliWizardLayout";

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

function Stars({ stars, className }: { stars: StarSpec[]; className: string }) {
  return stars.map(([left, top, width, color]) => (
    <Star
      key={`${left}-${top}`}
      className={`${className} absolute -translate-x-1/2 -translate-y-1/2 ${color}`}
      style={{ left, top, width, aspectRatio: "105/116" }}
    />
  ));
}

export function DupTestPage() {
  return (
    <LinenPaper className="min-h-dvh">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Almendra+SC&display=swap');`}</style>
      <PrintedInk className="mx-auto mt-8 aspect-square w-full sm:mt-0 sm:aspect-[2/1] xl:aspect-[3/1]">
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

        <Stars stars={TABLET_STARS} className="hidden sm:block xl:hidden" />
        <Stars stars={DESKTOP_STARS} className="hidden xl:block" />
      </PrintedInk>
    </LinenPaper>
  );
}
