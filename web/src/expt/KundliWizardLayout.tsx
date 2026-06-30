import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import parrotUrl from '@/assets/parrot-white.svg'

const Star = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 105 116"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M51.4613 0.894527C51.587 -0.299218 53.3247 -0.299226 53.4503 0.894519L58.6314 50.1116C58.6797 50.5706 59.0359 50.937 59.4933 50.9981L104.044 56.9561C105.201 57.1108 105.201 58.7838 104.044 58.9384L59.4933 64.8964C59.0359 64.9576 58.6797 65.3239 58.6314 65.7829L53.4503 115C53.3247 116.194 51.587 116.194 51.4613 115L46.2803 65.7829C46.2319 65.3239 45.8758 64.9576 45.4183 64.8964L0.867378 58.9384C-0.289217 58.7838 -0.289214 57.1108 0.867381 56.9561L45.4183 50.9981C45.8758 50.937 46.2319 50.5706 46.2803 50.1116L51.4613 0.894527Z" />
  </svg>
)

export function KundliWizardLayout({
  children,
  showLanding = false,
  onStart,
}: {
  children?: React.ReactNode
  showLanding?: boolean
  onStart?: () => void
}) {
  const [theme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('kk-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return 'dark'
  })

  useEffect(() => {
    const root = window.document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return (
    <div className="relative w-screen h-screen min-h-screen bg-white text-black overflow-hidden font-sans select-none flex flex-col items-center justify-start">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Almendra+SC&display=swap');
        .almendra-title {
          font-family: 'Almendra SC', serif;
        }
      `}</style>

      {/* Full-height line container spanning the entire screen width */}
      <div className="absolute inset-y-0 left-0 right-0 w-full pointer-events-none z-0">
        {/* Outer boundaries and center vertical line */}
        <div className="absolute inset-y-0 left-0 w-px bg-neutral-200" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-200" />
        <div className="absolute inset-y-0 right-0 w-px bg-neutral-200" />

        {/* Intermediate Left vertical lines */}
        {/* Tablet (sm: touchpoint at 25%) */}
        <div className="hidden sm:block xl:hidden absolute inset-y-0 w-px bg-neutral-200 left-1/4" />
        {/* Desktop (xl: touchpoint at 33.33%) */}
        <div className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200" style={{ left: '33.333%' }} />
        {/* Desktop (xl: center line for left black diamond at 16.67%) */}
        <div className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200" style={{ left: '16.667%' }} />

        {/* Intermediate Right vertical lines */}
        {/* Tablet (sm: touchpoint at 75%) */}
        <div className="hidden sm:block xl:hidden absolute inset-y-0 w-px bg-neutral-200 left-3/4" />
        {/* Desktop (xl: touchpoint at 66.67%) */}
        <div className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200" style={{ left: '66.667%' }} />
        {/* Desktop (xl: center line for right black diamond at 83.33%) */}
        <div className="hidden xl:block absolute inset-y-0 w-px bg-neutral-200" style={{ left: '83.333%' }} />
      </div>

      {/* Full-width aspect ratio container (100% viewport width) to span edge-to-edge */}
      {/* Mobile (1:1) -> Tablet (2:1) -> Desktop (3:1) */}
      <div className="w-full aspect-[1/1] sm:aspect-[2/1] xl:aspect-[3/1] relative bg-transparent z-10 pointer-events-none mx-auto mt-8 sm:mt-0">
        {/* --- Shapes Overlay --- */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Left black shape */}
          {/* Tablet (sm: half-triangle pointing right) */}
          <div 
            className="hidden sm:block xl:hidden absolute left-0 top-0 w-1/4 h-full bg-black"
            style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
          />
          {/* Desktop (xl: full black diamond) */}
          <div 
            className="hidden xl:block absolute top-0 w-1/3 h-full bg-black left-0"
            style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
          />

          {/* Right black shape */}
          {/* Tablet (sm: half-triangle pointing left) */}
          <div 
            className="hidden sm:block xl:hidden absolute right-0 top-0 w-1/4 h-full bg-black"
            style={{ clipPath: 'polygon(100% 0, 0 50%, 100% 100%)' }}
          />
          {/* Desktop (xl: full black diamond) */}
          <div 
            className="hidden xl:block absolute top-0 w-1/3 h-full bg-black"
            style={{ left: '66.667%', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
          />

          {/* Center gradient diamond - full width on mobile, 50% width on tablet, 33.33% width on desktop */}
          <div 
            className="absolute left-0 right-0 sm:left-1/4 sm:right-1/4 xl:left-1/3 xl:right-1/3 top-0 h-full bg-gradient-to-b from-[#180033] to-[#bd005d] flex flex-col items-center justify-center p-4 pointer-events-auto"
            style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
          >
            {showLanding ? (
              <h1 className="almendra-title text-4xl sm:text-5xl xl:text-6xl text-white text-center leading-tighter tracking-wider font-normal select-none">
                Klimate<br />Kundli
              </h1>
            ) : (
              <div className="w-full max-w-[340px] flex flex-col items-center justify-center text-white">
                {children}
              </div>
            )}
          </div>
        </div>

        {/* --- Stars overlay, matching the image exactly --- */}
        {/* ================= TABLET STARS (sm) ================= */}
        <Star 
          className="hidden sm:block xl:hidden absolute text-white -translate-x-1/2 -translate-y-1/2"
          style={{ left: '14.5%', top: '37%', width: '6.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '22%', top: '60%', width: '3.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-black -translate-x-1/2 -translate-y-1/2"
          style={{ left: '8%', top: '90%', width: '2.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '25%', top: '86%', width: '4.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-neutral-600 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '78%', top: '23%', width: '4.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-white -translate-x-1/2 -translate-y-1/2"
          style={{ left: '83%', top: '31%', width: '2.2%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '71%', top: '65%', width: '4.2%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-neutral-500 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '78%', top: '79%', width: '4.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden sm:block xl:hidden absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '93%', top: '92%', width: '2.5%', aspectRatio: '105/116' }}
        />

        {/* ================= DESKTOP STARS (xl) ================= */}
        <Star 
          className="hidden xl:block absolute text-white -translate-x-1/2 -translate-y-1/2"
          style={{ left: '18%', top: '37%', width: '6.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '28%', top: '60%', width: '3.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-black -translate-x-1/2 -translate-y-1/2"
          style={{ left: '10%', top: '90%', width: '2.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-neutral-400 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '33.333%', top: '86%', width: '4.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-neutral-600 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '66.667%', top: '23%', width: '4.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-white -translate-x-1/2 -translate-y-1/2"
          style={{ left: '82%', top: '31%', width: '2.2%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '62%', top: '65%', width: '4.2%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-neutral-500 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '66.667%', top: '79%', width: '4.5%', aspectRatio: '105/116' }}
        />
        <Star 
          className="hidden xl:block absolute text-neutral-300 -translate-x-1/2 -translate-y-1/2"
          style={{ left: '90%', top: '92%', width: '2.5%', aspectRatio: '105/116' }}
        />

        {/* --- Parrot and Button overlays (Landing state only) --- */}
        {showLanding && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20 top-full mt-[-40px] sm:mt-[-50px] xl:mt-[-55px]">
            {/* White Parrot overlapping bottom vertex and perched on button */}
            <div 
              className="relative aspect-[215/257] z-10 pointer-events-none w-[115px] xl:w-[130px] translate-y-[32%] -translate-x-[80%] xl:-translate-x-[95%]"
            >
              <img 
                src={parrotUrl} 
                alt="Parrot" 
                className="w-full h-full"
              />
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
    </div>
  )
}
