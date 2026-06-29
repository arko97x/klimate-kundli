import { NeuroNoise } from '@paper-design/shaders-react'

export function KundliWizardLayout() {
  return (
    <div className="dark relative flex min-h-dvh flex-col bg-black text-white overflow-hidden font-sans">
      {/* Background Gradient */}
      <div className="fixed inset-0 z-0 w-full h-full pointer-events-none">
        <NeuroNoise
          width={1280}
          height={720}
          colorFront="#bd0075"
          colorMid="#51007a"
          colorBack="#000000"
          scale={1.5}
          brightness={0.05}
          contrast={0.15}
          speed={0.25}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Header Bar */}
      <header className="relative z-10 mx-4 md:mx-auto mt-4 md:mt-6 flex w-auto md:w-full max-w-5xl items-center border border-white/40 bg-black/10 px-6 py-4 backdrop-blur-md">
        <span className="font-alegreya text-xl font-regular tracking-wider text-white">
          Klimate Kundli
        </span>

        {/* --- Grid Lines --- */}
        {/* Horizontal lines */}
        <div className="absolute top-0 right-full w-screen h-px bg-white/15 pointer-events-none" />
        <div className="absolute top-0 left-full w-screen h-px bg-white/15 pointer-events-none" />
        <div className="absolute bottom-0 right-full w-screen h-px bg-white/15 pointer-events-none" />
        <div className="absolute bottom-0 left-full w-screen h-px bg-white/15 pointer-events-none" />

        {/* Vertical lines extending up (height matches mt) */}
        <div className="absolute bottom-full left-0 w-px h-4 md:h-6 bg-white/15 pointer-events-none" />
        <div className="absolute bottom-full right-0 w-px h-4 md:h-6 bg-white/15 pointer-events-none" />

        {/* Vertical lines extending down */}
        <div className="absolute top-full left-0 w-px h-[calc(100vh-78px)] md:h-[calc(100vh-86px)] bg-white/15 pointer-events-none">
          {/* Sparkle star at the center of the line */}
          <div className="absolute top-1/2 left-0 w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 text-white/90 animate-pulse"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
            </svg>
          </div>
        </div>
        <div className="absolute top-full right-0 w-px h-[200vh] bg-white/15 pointer-events-none" />

        {/* Sparkle star at the top-right corner intersection */}
        <div className="absolute top-0 right-0 w-6 h-6 translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-white/90 animate-pulse"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
          </svg>
        </div>
      </header>

      {/* Semi-circle at the left edge of the screen, aligned with the bottom header grid line */}
      <div className="absolute left-0 top-[78px] md:top-[86px] w-6 h-12 -translate-y-1/2 rounded-r-full border-t border-b border-r border-white/15 bg-white/5 pointer-events-none z-10">
        {/* Pulsating sparkle star at the center flat edge intersection */}
        <div className="absolute top-1/2 left-0 w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-white/90 animate-pulse"
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
        <div className="absolute bottom-0 right-0 w-[136px] h-[68px] translate-x-1/2 rounded-t-full border-t border-l border-r border-dotted border-white/35" />
        {/* Outer dashed concentric semi-circle */}
        <div className="absolute bottom-0 right-0 w-32 h-16 translate-x-1/2 rounded-t-full border-t border-l border-r border-dashed border-white/35" />
        {/* Semi-circle where the right grid line hits the screen bottom */}
        <div className="absolute bottom-0 right-0 w-24 h-12 translate-x-1/2 rounded-t-full border-t border-l border-r border-white/15 bg-white/5" />
      </div>

      {/* --- Ambient Twinkling Stars strewn across the screen --- */}
      {/* Ambient Star 1 (Left-middle) */}
      <div 
        className="absolute top-[35%] left-[12%] w-3 h-3 text-white/50 pointer-events-none z-0"
        style={{ animation: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '0.3s' }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
        </svg>
      </div>

      {/* Ambient Star 2 (Right-middle) */}
      <div 
        className="absolute top-[48%] right-[22%] w-4 h-4 text-white/60 pointer-events-none z-0"
        style={{ animation: 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '1.1s' }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
        </svg>
      </div>

      {/* Ambient Star 3 (Bottom-left/middle) */}
      <div 
        className="absolute top-[75%] left-[28%] w-3.5 h-3.5 text-white/55 pointer-events-none z-0"
        style={{ animation: 'pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '2.3s' }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3Z" />
        </svg>
      </div>
    </div>
  )
}
