import { useEffect, useRef, useState } from "react";

export type GeoResult = {
  displayName: string;
  country: string | null;
  countryCode: string | null;
  admin1: string | null;
  lat: number;
  lon: number;
  canonical?: string;
  alsoKnownAs?: string[];
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: GeoResult) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
};

export function CityCombobox({ value, onChange, onSelect, placeholder, id, autoFocus }: Props) {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastQueryRef = useRef("");
  // Suppresses the next debounced search after a pick, so committing a
  // selection doesn't re-open the dropdown on the value change that follows.
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    const q = value.trim();
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      lastQueryRef.current = q;
      return;
    }
    if (q.length < 2 || q === lastQueryRef.current) return;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/geocode/search?q=${encodeURIComponent(q)}&limit=8`);
        const json = await res.json();
        if (q !== value.trim()) return;
        lastQueryRef.current = q;
        setResults(json.results ?? []);
        setOpen((json.results ?? []).length > 0);
        setActive(0);
      } catch {
        setResults([]);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function pick(r: GeoResult) {
    // Prefer canonical name (e.g. "Kolkata" over "Calcutta"). Falls back to
    // whatever the geocoder returned.
    const display = r.canonical && r.canonical.trim().length > 0
      ? r.canonical
      : r.displayName.split(",")[0]?.trim() ?? r.displayName;
    skipNextSearchRef.current = true;
    onSelect(r);
    onChange(display);
    setResults([]);
    setOpen(false);
    // Drop focus so the picked value reads as committed; pressing Enter again
    // (e.g. via the form's submit button) won't reopen the dropdown.
    inputRef.current?.blur();
  }

  return (
    <div ref={wrapRef} className="combobox">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (e.target.value.trim().length >= 2) setOpen(true);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const r = results[active];
            if (r) pick(r);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {open && results.length > 0 && (
        <ul className="combobox-list" role="listbox">
          {results.map((r, i) => {
            const head = r.displayName.split(",")[0]?.trim() ?? "";
            const primary = r.canonical && r.canonical !== head ? r.canonical : head;
            const aka = r.alsoKnownAs && r.alsoKnownAs.length > 0
              ? r.alsoKnownAs
                  .filter((n) => n.toLowerCase() !== primary.toLowerCase())
                  .join(", ")
              : null;
            return (
              <li
                key={`${r.lat},${r.lon},${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="combobox-name">
                  {primary}
                  {aka && <span className="combobox-aka"> · also {aka}</span>}
                </span>
                <span className="combobox-meta">
                  {[r.admin1, r.country].filter(Boolean).join(", ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
