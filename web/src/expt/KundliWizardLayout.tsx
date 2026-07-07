import { Button } from "@/components/ui/button";
import { Header } from "@/expt/Header";
import parrotUrl from "@/assets/parrot-white.svg";
import parrotStep1Url from "@/assets/parrot-step1.svg";
import parrotStep2Url from "@/assets/parrot-step2.svg";

const Star = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    viewBox="0 0 105 116"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M51.4613 0.894527C51.587 -0.299218 53.3247 -0.299226 53.4503 0.894519L58.6314 50.1116C58.6797 50.5706 59.0359 50.937 59.4933 50.9981L104.044 56.9561C105.201 57.1108 105.201 58.7838 104.044 58.9384L59.4933 64.8964C59.0359 64.9576 58.6797 65.3239 58.6314 65.7829L53.4503 115C53.3247 116.194 51.587 116.194 51.4613 115L46.2803 65.7829C46.2319 65.3239 45.8758 64.9576 45.4183 64.8964L0.867378 58.9384C-0.289217 58.7838 -0.289214 57.1108 0.867381 56.9561L45.4183 50.9981C45.8758 50.937 46.2319 50.5706 46.2803 50.1116L51.4613 0.894527Z" />
  </svg>
);

export function KundliWizardLayout({
  children,
  step = "landing",
  onStart,
}: {
  children?: React.ReactNode;
  step?: "landing" | "birth" | "lived";
  onStart?: () => void;
}) {
  return (
    <div className="relative w-screen h-screen min-h-screen bg-white text-black overflow-hidden font-sans select-none flex flex-col items-center justify-start">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Almendra+SC&display=swap');
        .almendra-title {
          font-family: 'Almendra SC', serif;
        }
      `}</style>

      {/* Public header: logo left, Gallery + New Kundli + hamburger right.
          Sits in-flow above the composition; hides its nav in exhibition mode. */}
      {step === "landing" && <Header />}

      {/* ================= LANDING BACKGROUND (GRID LINES) ================= */}
      {step === "landing" && (
        <div className="absolute inset-y-0 left-0 right-0 w-full pointer-events-none z-0">
          {/* Outer boundaries and center vertical line */}
          <div className="absolute inset-y-0 left-0 w-px bg-neutral-200" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-200" />
          <div className="absolute inset-y-0 right-0 w-px bg-neutral-200" />

          {/* Intermediate Left vertical lines */}
          {/* Tablet (sm: touchpoint at 25%) */}
          <div className="hidden sm:block xl:hidden absolute inset-y-0 w-px bg-neutral-200 left-1/4" />
          {/* Desktop (xl: touchpoint at 33.33%) */}
          <div
            className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200"
            style={{ left: "33.333%" }}
          />
          {/* Desktop (xl: center line for left black diamond at 16.67%) */}
          <div
            className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200"
            style={{ left: "16.667%" }}
          />

          {/* Intermediate Right vertical lines */}
          {/* Tablet (sm: touchpoint at 75%) */}
          <div className="hidden sm:block xl:hidden absolute inset-y-0 w-px bg-neutral-200 left-3/4" />
          {/* Desktop (xl: touchpoint at 66.67%) */}
          <div
            className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200"
            style={{ left: "66.667%" }}
          />
          {/* Desktop (xl: center line for right black diamond at 83.33%) */}
          <div
            className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200"
            style={{ left: "83.333%" }}
          />
        </div>
      )}

      {/* ================= STEP WIZARD BACKGROUND (KUNDLI CREASE OUTLINES) ================= */}
      {step !== "landing" && (
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {/* North Indian Kundli chart grid lines */}
          <svg
            className="w-full h-full stroke-neutral-200 fill-none"
            style={{ strokeWidth: 1.2 }}
          >
            {/* Full Vertical lines */}
            <line x1="0" y1="0" x2="0" y2="100%" />
            <line x1="25%" y1="0" x2="25%" y2="100%" />
            <line x1="50%" y1="0" x2="50%" y2="100%" />
            <line x1="75%" y1="0" x2="75%" y2="100%" />
            <line x1="100%" y1="0" x2="100%" y2="100%" />

            {/* Full Horizontal lines */}
            <line x1="0" y1="0" x2="100%" y2="0" />
            <line x1="0" y1="50%" x2="100%" y2="50%" />
            <line x1="0" y1="100%" x2="100%" y2="100%" />

            {/* Partial Horizontal lines */}
            <line x1="0" y1="25%" x2="25%" y2="25%" />
            <line x1="75%" y1="25%" x2="100%" y2="25%" />
            <line x1="0" y1="75%" x2="25%" y2="75%" />
            <line x1="75%" y1="75%" x2="100%" y2="75%" />

            {/* Main Diagonals */}
            <line x1="0" y1="0" x2="100%" y2="100%" />
            <line x1="100%" y1="0" x2="0" y2="100%" />

            {/* Outer Diamond */}
            <line x1="50%" y1="0" x2="0" y2="50%" />
            <line x1="50%" y1="0" x2="100%" y2="50%" />
            <line x1="50%" y1="100%" x2="0" y2="50%" />
            <line x1="50%" y1="100%" x2="100%" y2="50%" />

            {/* Inner Diamond */}
            <line x1="25%" y1="50%" x2="50%" y2="25%" />
            <line x1="50%" y1="25%" x2="75%" y2="50%" />
            <line x1="75%" y1="50%" x2="50%" y2="75%" />
            <line x1="50%" y1="75%" x2="25%" y2="50%" />

            {/* Diagonals in middle-left and middle-right */}
            <line x1="0" y1="25%" x2="25%" y2="50%" />
            <line x1="0" y1="75%" x2="25%" y2="50%" />
            <line x1="100%" y1="25%" x2="75%" y2="50%" />
            <line x1="100%" y1="75%" x2="75%" y2="50%" />

            {/* Corner Diagonals */}
            <line x1="0" y1="25%" x2="25%" y2="0" />
            <line x1="75%" y1="0" x2="100%" y2="25%" />
            <line x1="0" y1="75%" x2="25%" y2="100%" />
            <line x1="75%" y1="100%" x2="100%" y2="75%" />
          </svg>

          {/* Step Stars overlay (positioned relative to full screen viewport) */}
          <Star
            className="absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: "58%", top: "10%", width: "4%" }}
          />
          <Star
            className="absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: "65%", top: "18%", width: "3%" }}
          />
          <Star
            className="absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: "88%", top: "38%", width: "3.5%" }}
          />
          <Star
            className="absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: "9%", top: "78%", width: "4.5%" }}
          />
          <Star
            className="absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: "70%", top: "86%", width: "3.2%" }}
          />

          {/* Logo in the top-left area (positioned relative to full screen viewport) */}
          <div className="absolute left-[8%] top-[11%] text-left pointer-events-none z-10 select-none">
            <h1 className="almendra-title text-4xl sm:text-5xl xl:text-6xl text-black leading-none uppercase font-normal tracking-wide">
              Klimate
              <br />
              Kundli
            </h1>
          </div>

          {/* Pose-Specific Black Parrot (positioned relative to full screen bottom-right corner) */}
          <div className="absolute right-[4%] bottom-[4%] w-[95px] sm:w-[120px] md:w-[145px] xl:w-[165px] aspect-[280/432] pointer-events-none z-30 flex items-end justify-end">
            <img
              src={step === "lived" ? parrotStep2Url : parrotStep1Url}
              alt="Perched Parrot"
              className="w-full h-auto"
            />
          </div>

          {/* Children step wrapper container */}
          <div className="absolute inset-0 pointer-events-auto z-20">
            {children}
          </div>
        </div>
      )}

      {/* Full-width aspect ratio container (100% viewport width) to span edge-to-edge */}
      {/* Mobile (1:1) -> Tablet (2:1) -> Desktop (3:1) */}
      <div className="w-full aspect-[1/1] sm:aspect-[2/1] xl:aspect-[3/1] relative bg-transparent z-10 pointer-events-none mx-auto mt-8 sm:mt-0">
        {/* --- Landing page layout shapes --- */}
        {step === "landing" && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Left black shape */}
            {/* Tablet (sm: half-triangle pointing right) */}
            <div
              className="hidden sm:block xl:hidden absolute left-0 top-0 w-1/4 h-full bg-black"
              style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%)" }}
            />
            {/* Desktop (xl: full black diamond) */}
            <div
              className="hidden xl:block absolute top-0 w-1/3 h-full bg-black left-0"
              style={{
                clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              }}
            />

            {/* Right black shape */}
            {/* Tablet (sm: half-triangle pointing left) */}
            <div
              className="hidden sm:block xl:hidden absolute right-0 top-0 w-1/4 h-full bg-black"
              style={{ clipPath: "polygon(100% 0, 0 50%, 100% 100%)" }}
            />
            {/* Desktop (xl: full black diamond) */}
            <div
              className="hidden xl:block absolute top-0 w-1/3 h-full bg-black"
              style={{
                left: "66.667%",
                clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              }}
            />

            {/* Center gradient diamond */}
            <div
              className="absolute left-0 right-0 sm:left-1/4 sm:right-1/4 xl:left-1/3 xl:right-1/3 top-0 h-full bg-gradient-to-b from-[#180033] to-[#bd005d] flex flex-col items-center justify-center p-4 pointer-events-auto"
              style={{
                clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              }}
            >
              <h1 className="almendra-title text-4xl sm:text-5xl xl:text-6xl text-white text-center leading-tighter tracking-wider font-normal select-none">
                Klimate
                <br />
                Kundli
              </h1>
            </div>

            {/* ================= TABLET STARS (sm) ================= */}
            <Star
              className="hidden sm:block xl:hidden absolute text-white -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "14.5%",
                top: "37%",
                width: "6.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "22%",
                top: "60%",
                width: "3.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-black -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "8%",
                top: "90%",
                width: "2.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "25%",
                top: "86%",
                width: "4.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-neutral-600 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "78%",
                top: "23%",
                width: "4.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-white -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "83%",
                top: "31%",
                width: "2.2%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "71%",
                top: "65%",
                width: "4.2%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-neutral-500 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "78%",
                top: "79%",
                width: "4.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden sm:block xl:hidden absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "93%",
                top: "92%",
                width: "2.5%",
                aspectRatio: "105/116",
              }}
            />

            {/* ================= DESKTOP STARS (xl) ================= */}
            <Star
              className="hidden xl:block absolute text-white -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "18%",
                top: "37%",
                width: "6.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "28%",
                top: "60%",
                width: "3.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-black -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "10%",
                top: "90%",
                width: "2.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "33.333%",
                top: "86%",
                width: "4.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-neutral-600 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "66.667%",
                top: "23%",
                width: "4.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-white -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "82%",
                top: "31%",
                width: "2.2%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "62%",
                top: "65%",
                width: "4.2%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-neutral-500 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "66.667%",
                top: "79%",
                width: "4.5%",
                aspectRatio: "105/116",
              }}
            />
            <Star
              className="hidden xl:block absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: "90%",
                top: "92%",
                width: "2.5%",
                aspectRatio: "105/116",
              }}
            />
          </div>
        )}
      </div>

      {/* Landing Get Started button — pinned to screen bottom to match wizard-step buttons */}
      {step === "landing" && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[6%] flex flex-col items-center pointer-events-none z-20">
          {/* White Parrot perched on button */}
          <div className="relative aspect-[215/257] z-10 pointer-events-none w-[115px] xl:w-[130px] translate-y-[32%] -translate-x-[80%] xl:-translate-x-[95%]">
            <img src={parrotUrl} alt="Parrot" className="w-full h-full" />
          </div>

          <Button
            onClick={onStart}
            className="bg-black text-white hover:bg-black/90 rounded-none font-semibold tracking-wider shadow-lg pointer-events-auto w-[180px] h-[44px] sm:w-[240px] sm:h-[52px] text-xs sm:text-sm xl:text-base uppercase transition-all hover:scale-[1.02] z-20"
          >
            Get Started
          </Button>
        </div>
      )}
    </div>
  );
}
