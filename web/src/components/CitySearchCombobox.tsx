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

/** cmdk auto-highlights first item when value is ""; use a non-matching sentinel instead. */
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

      {showList ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          ref={listRef}
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <Command
            shouldFilter={false}
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
        </div>
      ) : null}
    </div>
  )
}
