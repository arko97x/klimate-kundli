import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MenuIcon, SunIcon, MoonIcon } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { buildWavyRectPath, WAVE_BORDER_PAD, wavyBorderViewBox } from '@/expt/wavy-border'
import { useIsExhibition } from '@/lib/exhibition-context'

type FrameSize = { width: number; height: number }

const MENU_ITEMS = [
  { label: 'About', path: '/about' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Disclaimer', path: '/disclaimer' },
  { label: 'Climate Twin', path: '/klimate-twin' },
] as const

export function HeaderMenu() {
  return (
    <Popover>
      <PopoverTrigger
        className={buttonVariants({ variant: 'outline', size: 'icon' })}
        aria-label="Open menu"
      >
        <MenuIcon className="size-5" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-52 gap-0 p-1">
        <ul className="flex flex-col">
          {MENU_ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                to={item.path}
                className="flex w-full rounded-none px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function Header() {
  const isExhibition = useIsExhibition()
  const headerRef = useRef<HTMLElement>(null)
  const [frameSize, setFrameSize] = useState<FrameSize>(() => ({
    width: 0,
    height: 80,
  }))

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

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return

    const update = () => {
      const { width, height } = header.getBoundingClientRect()
      setFrameSize({ width, height })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const viewBox = wavyBorderViewBox(frameSize.width, frameSize.height)
  const pad = WAVE_BORDER_PAD

  return (
    <header
      ref={headerRef}
      className="relative z-10 w-full shrink-0 overflow-visible bg-transparent"
    >
      <div className="relative z-10 flex items-center px-4 py-4 sm:px-6 sm:py-6">
        <Link to={isExhibition ? '/exhibition' : '/'} className="shrink-0" aria-label="Klimate Kundli home">
          <img
            src="/kk-icon-beta.svg"
            alt="Klimate Kundli (Beta)"
            width={35}
            height={22}
            className="h-12 w-auto"
          />
        </Link>
        {!isExhibition && (
          <nav className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              to="/gallery"
              className="text-sm font-medium text-foreground transition-colors hover:text-foreground/70"
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
              className="size-9 text-foreground transition-colors hover:text-foreground/70"
            >
              {theme === 'dark' ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
            </Button>
            <HeaderMenu />
          </nav>
        )}
      </div>
      {frameSize.width > 0 ? (
        <svg
          aria-hidden
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          className="pointer-events-none absolute text-[#0A9396]"
          style={{
            top: -pad,
            left: -pad,
            width: frameSize.width + pad * 2,
            height: frameSize.height + pad * 2,
          }}
        >
          <path
            d={buildWavyRectPath(frameSize.width, frameSize.height)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
    </header>
  )
}

