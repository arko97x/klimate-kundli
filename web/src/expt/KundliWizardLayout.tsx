import { NeuroNoise } from '@paper-design/shaders-react'
import { SunIcon, MoonIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button, buttonVariants } from '@/components/ui/button'
import { HeaderMenu } from '@/expt/Header'
import { useIsExhibition } from '@/lib/exhibition-context'
import { cn } from '@/lib/utils'

export function KundliWizardLayout({ children }: { children?: React.ReactNode }) {
  const isExhibition = useIsExhibition()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('kk-theme', next)
  }

  const isDark = theme === 'dark'
  const borderColor = isDark ? 'border-white/40' : 'border-purple-950/20'
  const lineBg = isDark ? 'bg-white/15' : 'bg-purple-950/10'
  const textMuted = isDark ? 'text-white/80' : 'text-purple-950/80'
  const hoverText = isDark ? 'hover:text-white' : 'hover:text-purple-950'
  const sparkleColor = isDark ? 'text-white/90' : 'text-purple-950/80'
  const starColor = isDark ? 'text-white/50' : 'text-purple-950/40'
  const semiCircleBg = isDark ? 'bg-white/5 border-white/15' : 'bg-purple-950/5 border-purple-950/10'
  const semiCircleBorderDotted = isDark ? 'border-white/35' : 'border-purple-950/25'
  const headerBg = 'bg-black/10'
  const mainBg = 'bg-black/10'

  return (
    <div className={cn(
      "relative flex min-h-dvh flex-col overflow-hidden font-sans transition-colors duration-250",
      isDark ? 'dark bg-black text-white' : 'bg-[#fcfbfe] text-purple-950'
    )}>
      {/* Background Gradient */}
      <div className="fixed inset-0 z-0 w-full h-full pointer-events-none">
        <NeuroNoise
          width={1280}
          height={720}
          colorFront={isDark ? "#bd0075" : "#ffd6f5"}
          colorMid={isDark ? "#51007a" : "#d9c3ff"}
          colorBack={isDark ? "#000000" : "#fcfbfe"}
          scale={1.5}
          brightness={isDark ? 0.05 : 1.15}
          contrast={isDark ? 0.15 : 0.4}
          speed={0.12}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Header Bar */}
      <header className={cn(
        "relative z-10 mx-4 md:mx-auto mt-4 md:mt-6 flex h-[62px] w-auto md:w-full max-w-5xl items-center border px-3 sm:px-6 py-0 backdrop-blur-xl transition-colors duration-250",
        borderColor,
        headerBg
      )}>
        <span className={cn("font-alegreya text-xl font-normal tracking-wider", isDark ? "text-white" : "text-purple-950")}>
          Klimate Kundli
        </span>

        {!isExhibition && (
          <nav className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              to="/gallery"
              className={cn("text-sm font-medium transition-colors", textMuted, hoverText)}
            >
              Explore
            </Link>
            <Link to="/" className={buttonVariants()}>
              New Kundli
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={cn("size-9 text-current hover:bg-transparent", textMuted, hoverText)}
            >
              {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
            </Button>
            <HeaderMenu />
          </nav>
        )}

        {/* --- Grid Lines --- */}
        {/* Horizontal lines */}
        <div className={cn("absolute top-0 right-full w-screen h-px pointer-events-none", lineBg)} />
        <div className={cn("absolute top-0 left-full w-screen h-px pointer-events-none", lineBg)} />
        <div className={cn("absolute bottom-0 right-full w-screen h-px pointer-events-none", lineBg)} />
        <div className={cn("absolute bottom-0 left-full w-screen h-px pointer-events-none", lineBg)} />

        {/* Vertical lines extending up (height matches mt) */}
        <div className={cn("absolute bottom-full left-0 w-px h-4 md:h-6 pointer-events-none", lineBg)} />
        <div className={cn("absolute bottom-full right-0 w-px h-4 md:h-6 pointer-events-none", lineBg)} />

        {/* Vertical lines extending down */}
        <div className={cn("absolute top-full left-0 w-px h-[calc(100vh-78px)] md:h-[calc(100vh-86px)] pointer-events-none", lineBg)}>
          {/* Sparkle star at the center of the line */}
          <div className="absolute top-1/2 left-0 w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className={cn("w-4 h-4 animate-pulse", sparkleColor)}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
            </svg>
          </div>
        </div>
        <div className={cn("absolute top-full right-0 w-px h-[200vh] pointer-events-none", lineBg)} />

        {/* Sparkle star at the top-right corner intersection */}
        <div className="absolute top-0 right-0 w-6 h-6 translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={cn("w-4 h-4 animate-pulse", sparkleColor)}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
          </svg>
        </div>
      </header>

      {/* Main Content Card / Form Inputs Container */}
      {children && (
        <main className={cn(
          "relative z-10 mx-4 md:mx-auto mt-4 md:mt-6 mb-4 md:mb-6 flex-1 flex flex-col min-h-0 w-auto md:w-full max-w-5xl border backdrop-blur-xl px-3 sm:px-6 pt-6 sm:pt-8 pb-0 transition-colors duration-250",
          borderColor,
          mainBg
        )}>
          {children}

          {/* Horizontal border extensions */}
          <div className={cn("absolute top-0 right-full w-screen h-px pointer-events-none", lineBg)} />
          <div className={cn("absolute top-0 left-full w-screen h-px pointer-events-none", lineBg)} />
          <div className={cn("absolute bottom-0 right-full w-screen h-px pointer-events-none", lineBg)} />
          <div className={cn("absolute bottom-0 left-full w-screen h-px pointer-events-none", lineBg)} />
        </main>
      )}

      {/* Semi-circle at the left edge of the screen, aligned with the bottom header grid line */}
      <div className={cn("absolute left-0 top-[78px] md:top-[86px] w-6 h-12 -translate-y-1/2 rounded-r-full border-t border-b border-r pointer-events-none z-10", semiCircleBg)}>
        {/* Pulsating sparkle star at the center flat edge intersection */}
        <div className="absolute top-1/2 left-0 w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={cn("w-4 h-4 animate-pulse", sparkleColor)}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
          </svg>
        </div>
      </div>

      {/* Grid marker wrapper matching the header's horizontal layout */}
      <div className="fixed inset-y-0 left-0 right-0 mx-4 md:mx-auto w-auto md:w-full max-w-5xl pointer-events-none z-10">
        {/* Third outer dotted concentric semi-circle */}
        <div className={cn("absolute bottom-0 right-0 w-[136px] h-[68px] translate-x-1/2 rounded-t-full border-t border-l border-r border-dotted", semiCircleBorderDotted)} />
        {/* Outer dashed concentric semi-circle */}
        <div className={cn("absolute bottom-0 right-0 w-32 h-16 translate-x-1/2 rounded-t-full border-t border-l border-r border-dashed", semiCircleBorderDotted)} />
        {/* Semi-circle where the right grid line hits the screen bottom */}
        <div className={cn("absolute bottom-0 right-0 w-24 h-12 translate-x-1/2 rounded-t-full border-t border-l border-r", semiCircleBg)} />
      </div>

      {/* --- Ambient Twinkling Stars strewn across the screen --- */}
      {/* Ambient Star 1 (Left-middle) */}
      <div
        className={cn("absolute top-[35%] left-[12%] w-3 h-3 pointer-events-none z-0", starColor)}
        style={{ animation: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '0.3s' }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
        </svg>
      </div>

      {/* Ambient Star 2 (Right-middle) */}
      <div
        className={cn("absolute top-[48%] right-[22%] w-4 h-4 pointer-events-none z-0", starColor)}
        style={{ animation: 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '1.1s' }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
        </svg>
      </div>

      {/* Ambient Star 3 (Bottom-left/middle) */}
      <div
        className={cn("absolute top-[75%] left-[28%] w-3.5 h-3.5 pointer-events-none z-0", starColor)}
        style={{ animation: 'pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '2.3s' }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
        </svg>
      </div>
    </div>
  )
}
