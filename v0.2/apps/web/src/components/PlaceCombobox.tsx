import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchPlaces } from "@/lib/api";
import type { PlaceHit } from "@/lib/types";

type Props = {
  value: PlaceHit | null;
  onChange: (place: PlaceHit | null) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  // Slugs that are already chosen elsewhere in the form. We still *show*
  // them in results but tag them as already-picked so visitors don't enter
  // the same city twice (which would just be a duplicate row to the API).
  excludeSlugs?: string[];
};

// Manual debounce + AbortController. Each keystroke fires a request 180ms
// after typing stops; in-flight requests for stale queries are aborted so
// the order they come back in doesn't matter.
function useDebouncedPlaces(query: string) {
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const hits = await searchPlaces(q, controller.signal);
        setResults(hits);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return { results, loading };
}

export function PlaceCombobox({
  value,
  onChange,
  placeholder = "Search a city…",
  id,
  ariaLabel,
  excludeSlugs = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, loading } = useDebouncedPlaces(query);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "w-full justify-between font-sans text-sm h-11 px-3",
            !value && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 opacity-60" />
            {value ? (
              <span className="truncate">
                <span className="text-foreground">{value.name}</span>
                <span className="text-muted-foreground">
                  {value.admin1 ? `, ${value.admin1}` : ""}, {value.country}
                </span>
              </span>
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            {value && (
              <button
                type="button"
                aria-label="Clear selection"
                className="rounded-sm p-1 -mr-1 hover:bg-foreground/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                  setQuery("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        // Stop the focus from snapping back to the trigger before the user
        // can read the result list. Radix portals to body so this is safe.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a city name…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            {!loading && results.length === 0 && query.trim().length > 0 && (
              <CommandEmpty>No matches in the pilot set.</CommandEmpty>
            )}
            {!loading && results.length === 0 && query.trim().length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Pilot set: 33 Indian cities + 34 global. Start typing.
              </div>
            )}
            {loading && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Searching…
              </div>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((p) => {
                  const used = excludeSlugs.includes(p.slug);
                  return (
                    <CommandItem
                      key={p.slug}
                      value={p.slug}
                      disabled={used}
                      onSelect={() => {
                        onChange(p);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="flex flex-1 items-baseline justify-between gap-2">
                        <span className="font-sans">
                          <span className="text-foreground">{p.name}</span>
                          <span className="text-muted-foreground">
                            {p.admin1 ? `, ${p.admin1}` : ""}, {p.country}
                          </span>
                        </span>
                        <span className="font-mono text-[0.65rem] text-muted-foreground">
                          {used ? "in form" : p.countryCode}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
