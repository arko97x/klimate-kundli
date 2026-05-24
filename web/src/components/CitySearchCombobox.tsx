import { useEffect, useId, useRef, useState } from 'react'
import { CheckIcon } from 'lucide-react'

import { geocodeCities } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { City } from '@/types'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'

type CitySearchComboboxProps = {
  value: City | null
  onValueChange: (city: City | null) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}

export function CitySearchCombobox({
  value,
  onValueChange,
  placeholder = 'Search for your birth city',
  disabled = false,
  id: idProp,
  className,
}: CitySearchComboboxProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<City[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputValue = open ? query : (value?.displayName ?? query)
  const showList = open && query.trim().length >= 2
  const canNavigate = showList && !loading && !error && results.length > 0

  const close = (keepQuery = false) => {
    setOpen(false)
    setActiveIndex(-1)
    if (!keepQuery) {
      setQuery('')
    }
  }

  const selectCity = (city: City) => {
    onValueChange(city)
    close()
    inputRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    setActiveIndex(-1)
  }, [query, results, loading, error])

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return
      }
      close()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setError(null)
      return
    }

    const handle = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      geocodeCities(q)
        .then(setResults)
        .catch(() => setError('Search unavailable'))
        .finally(() => setLoading(false))
    }, 300)

    return () => window.clearTimeout(handle)
  }, [query, open])

  useEffect(() => {
    if (!canNavigate || activeIndex < 0) {
      return
    }

    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    )
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, canNavigate])

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }

    if (!canNavigate) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % results.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1,
      )
      return
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      const city = results[activeIndex]
      if (city) {
        selectCity(city)
      }
    }
  }

  const activeOptionId =
    activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <form
        autoComplete="off"
        className="relative"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? `${id}-listbox` : undefined}
          aria-activedescendant={showList ? activeOptionId : undefined}
          aria-autocomplete="list"
          autoComplete="one-time-code"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          readOnly
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          onFocus={(event) => {
            event.currentTarget.readOnly = false
            setOpen(true)
            setQuery(value?.displayName ?? query)
          }}
        onKeyDown={handleInputKeyDown}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          setOpen(true)
          if (value) {
            onValueChange(null)
          }
        }}
        />
      </form>

      {showList ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          ref={listRef}
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <Command shouldFilter={false}>
            <CommandList>
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
              ) : null}
              {error ? (
                <p className="py-6 text-center text-sm text-destructive">{error}</p>
              ) : null}
              {!loading && !error && results.length === 0 ? (
                <CommandEmpty>No cities found</CommandEmpty>
              ) : null}
              <CommandGroup>
                {results.map((city, index) => (
                  <CommandItem
                    key={`${city.lat}-${city.lon}-${city.displayName}`}
                    value={city.displayName}
                    id={`${id}-option-${index}`}
                    data-option-index={index}
                    aria-selected={activeIndex === index}
                    className={cn(activeIndex === index && 'bg-accent text-accent-foreground')}
                    onSelect={() => selectCity(city)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <CheckIcon
                      className={cn(
                        'size-4',
                        value?.displayName === city.displayName ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {city.displayName}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  )
}
