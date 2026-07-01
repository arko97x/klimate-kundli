import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/** Non-matching cmdk value while list is loading or empty (avoids stray highlight). */
const CMDK_NO_SELECTION = '__city_combobox_no_selection__'

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
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    if (!open || !inputRef.current) {
      setCoords(null)
      return
    }

    const updateCoords = () => {
      const rect = inputRef.current!.getBoundingClientRect()
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }

    updateCoords()
    window.addEventListener('resize', updateCoords)
    window.addEventListener('scroll', updateCoords, true)

    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
    }
  }, [open])

  const inputValue = open ? query : (value?.displayName ?? query)
  const queryTrimmed = query.trim()
  const committedLabel = value?.displayName.trim() ?? ''
  const isActivelySearching =
    open &&
    queryTrimmed.length >= 2 &&
    (value === null || queryTrimmed !== committedLabel)
  const showList = isActivelySearching
  const canNavigate = showList && !loading && !error && results.length > 0

  const isSameCity = (a: City, b: City) => a.lat === b.lat && a.lon === b.lon

  const close = (keepQuery = false) => {
    setOpen(false)
    setActiveIndex(-1)
    if (!keepQuery) {
      setQuery('')
    }
  }

  const selectCity = (city: City) => {
    onValueChange(city)
    setQuery(city.displayName)
    close(true)
    inputRef.current?.blur()
  }

  useEffect(() => {
    setActiveIndex(canNavigate ? 0 : -1)
  }, [query, results, loading, error, canNavigate])

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        rootRef.current?.contains(event.target as Node) ||
        listRef.current?.contains(event.target as Node)
      ) {
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

    const q = queryTrimmed
    if (q.length < 2) {
      setResults([])
      setError(null)
      return
    }

    if (value !== null && q === committedLabel) {
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
  }, [query, open, value, committedLabel, queryTrimmed])

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

    if (event.key === 'Enter') {
      event.preventDefault()
      const city =
        activeIndex >= 0 ? results[activeIndex] : results[0]
      if (city) {
        selectCity(city)
      }
    }
  }

  const activeOptionId =
    activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined

  const activeItemValue =
    activeIndex >= 0
      ? (results[activeIndex]?.displayName ?? CMDK_NO_SELECTION)
      : CMDK_NO_SELECTION

  const enableInput = (input: HTMLInputElement) => {
    if (input.readOnly) {
      input.readOnly = false
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <form
        autoComplete="off"
        className="relative -m-1 p-1"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          ref={inputRef}
          className={className}
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
          onPointerDown={(event) => enableInput(event.currentTarget)}
          onFocus={(event) => {
            enableInput(event.currentTarget)
            setOpen(true)
            setQuery(value?.displayName ?? query)
          }}
          onBlur={(event) => {
            event.currentTarget.readOnly = true
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

      {showList && coords ? createPortal(
        <div
          id={`${id}-listbox`}
          role="listbox"
          ref={listRef}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
          }}
          className="z-50 mt-1 overflow-hidden rounded-none border border-neutral-300 bg-white text-black shadow-md"
        >
          <Command
            shouldFilter={false}
            className="bg-transparent dark:bg-transparent"
            value={activeItemValue}
            onValueChange={(selected) => {
              const index = results.findIndex((city) => city.displayName === selected)
              if (index >= 0) {
                setActiveIndex(index)
              }
            }}
          >
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
                    onMouseDown={(event) => event.preventDefault()}
                    onSelect={() => selectCity(city)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="text-base md:text-lg py-2.5"
                  >
                    <CheckIcon
                      className={cn(
                        'size-4 shrink-0',
                        value && isSameCity(value, city) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {city.displayName}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
