import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MenuIcon } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useIsExhibition } from '@/lib/exhibition-context'
import { cn } from '@/lib/utils'

const MENU_ITEMS = [
  { label: 'About', path: '/about' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Disclaimer', path: '/disclaimer' },
  { label: 'Climate Twin', path: '/klimate-twin' },
] as const

export function HeaderMenu({
  className,
  variant = 'outline',
}: {
  className?: string
  variant?: 'outline' | 'ghost'
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant, size: 'icon' }), className)}
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

export function Header({ actions }: { actions?: ReactNode }) {
  const isExhibition = useIsExhibition()

  // Smart header: hide when scrolling down (immersive reading), slide back in
  // when scrolling up. Sticky (not fixed) so it needs no spacer and never
  // jumps the layout — it just translates out of and into view.
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (isExhibition) return
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY
      if (y < 64) {
        setHidden(false) // always visible near the top
      } else if (Math.abs(delta) > 6) {
        setHidden(delta > 0) // down → hide, up → show; ignore tiny jitters
      }
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isExhibition])

  // No header at all on the exhibition landing.
  if (isExhibition) return null

  return (
    <header
      className="sticky top-0 z-40 w-full shrink-0 bg-white border-b border-neutral-200 transition-transform duration-300 motion-reduce:transition-none"
      style={{ transform: hidden ? 'translateY(-100%)' : 'translateY(0)' }}
    >
      <div className="flex items-center px-4 py-3 sm:px-6 sm:py-4">
        <Link
          to="/"
          className="shrink-0 text-xl sm:text-2xl leading-none tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-alegreya)' }}
          aria-label="Klimate Kundli home"
        >
          klimate kundli
        </Link>
        <nav className="ml-auto flex items-center gap-2 sm:gap-3">
          {actions ?? (
            <>
              <Link
                to="/gallery"
                className="text-sm font-medium text-foreground transition-colors hover:text-foreground/70"
              >
                Explore
              </Link>
              <Link to="/" className={buttonVariants()}>
                New Kundli
              </Link>
              <HeaderMenu />
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

