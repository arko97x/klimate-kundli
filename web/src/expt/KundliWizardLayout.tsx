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
          speed={1}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Dither overlay layer */}
        <div className="dither-overlay" />
      </div>

      {/* Header Bar */}
      <header className="relative z-10 mx-4 md:mx-auto mt-4 md:mt-6 flex w-auto md:w-full max-w-5xl items-center border border-white/40 bg-black/10 px-6 py-4 backdrop-blur-md">
        <span className="font-alegreya text-xl font-regular tracking-wider text-white">
          Klimate Kundli
        </span>

        {/* --- Grid Lines --- */}
        {/* Horizontal lines */}
        <div className="absolute top-0 right-full w-screen dashed-line-h pointer-events-none" />
        <div className="absolute top-0 left-full w-screen dashed-line-h pointer-events-none" />
        <div className="absolute bottom-0 right-full w-screen dashed-line-h pointer-events-none" />
        <div className="absolute bottom-0 left-full w-screen dashed-line-h pointer-events-none" />

        {/* Vertical lines extending up (height matches mt) */}
        <div className="absolute bottom-full left-0 h-4 md:h-6 dashed-line-v pointer-events-none" />
        <div className="absolute bottom-full right-0 h-4 md:h-6 dashed-line-v pointer-events-none" />

        {/* Vertical lines extending down */}
        <div className="absolute top-full left-0 h-[200vh] dashed-line-v pointer-events-none" />
        <div className="absolute top-full right-0 h-[200vh] dashed-line-v pointer-events-none" />
      </header>
    </div>
  )
}
