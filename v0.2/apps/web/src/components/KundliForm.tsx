import { useMemo, useState } from "react";
import { Plus, Sparkles, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceCombobox } from "@/components/PlaceCombobox";
import { StayRow } from "@/components/StayRow";
import type { PlaceHit, StayInput } from "@/lib/types";

let __uid = 0;
const nextUid = () => `s${++__uid}`;

function emptyStay(): StayInput {
  return { uid: nextUid(), place: null, start: "", end: "", stillHere: false };
}

export type KundliSubmit = {
  birthSlug: string;
  birthDate: string;
  lived: { slug: string; start: string; end: string }[];
};

type Props = {
  loading: boolean;
  onSubmit: (s: KundliSubmit) => void;
  error: string | null;
};

export function KundliForm({ loading, onSubmit, error }: Props) {
  const [birthPlace, setBirthPlace] = useState<PlaceHit | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [stays, setStays] = useState<StayInput[]>([emptyStay()]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const usedSlugs = useMemo(() => {
    const set = new Set<string>();
    if (birthPlace) set.add(birthPlace.slug);
    for (const s of stays) if (s.place) set.add(s.place.slug);
    return [...set];
  }, [birthPlace, stays]);

  function setStayAt(i: number, next: StayInput) {
    setStays((curr) => curr.map((s, idx) => (idx === i ? next : s)));
  }
  function removeStayAt(i: number) {
    setStays((curr) => curr.filter((_, idx) => idx !== i));
  }
  function addStay() {
    setStays((curr) => [...curr, emptyStay()]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (!birthPlace) {
      setValidationError("Pick your birthplace.");
      return;
    }
    if (!birthDate) {
      setValidationError("Pick your birth date.");
      return;
    }
    const lived: { slug: string; start: string; end: string }[] = [];
    for (const [i, s] of stays.entries()) {
      // Allow rows that are entirely empty — visitor may not have lived
      // anywhere else. But once any field is filled, all three must be.
      const anyFilled = !!(s.place || s.start || s.end || s.stillHere);
      if (!anyFilled) continue;
      if (!s.place) {
        setValidationError(`City ${i + 1}: pick a place.`);
        return;
      }
      if (!s.start) {
        setValidationError(`${s.place.name}: missing move-in date.`);
        return;
      }
      if (!s.stillHere && !s.end) {
        setValidationError(
          `${s.place.name}: missing move-out date (or check "still living here").`,
        );
        return;
      }
      if (!s.stillHere && s.end && s.start > s.end) {
        setValidationError(`${s.place.name}: move-in is after move-out.`);
        return;
      }
      lived.push({
        slug: s.place.slug,
        start: s.start,
        end: s.stillHere ? "today" : s.end,
      });
    }
    onSubmit({ birthSlug: birthPlace.slug, birthDate, lived });
  }

  const fieldError = validationError ?? error;

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="sr-only">Birth</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="birth-place">Birthplace</Label>
            <PlaceCombobox
              id="birth-place"
              value={birthPlace}
              onChange={setBirthPlace}
              placeholder="Where were you born?"
              excludeSlugs={usedSlugs.filter((s) => s !== birthPlace?.slug)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth-date">Birth date</Label>
            <Input
              id="birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              className="h-11 font-mono"
              max={new Date().toISOString().slice(0, 10)}
              min="1900-01-01"
            />
          </div>
        </div>
      </fieldset>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-medium tracking-tight">
            Cities you have called home
          </h2>
          <span className="font-sans text-xs text-muted-foreground">
            optional · in chronological order
          </span>
        </div>
        <div className="almanac-rule" />
        <div className="space-y-3">
          {stays.map((s, i) => (
            <StayRow
              key={s.uid}
              index={i + 1}
              stay={s}
              canRemove={stays.length > 1}
              onChange={(n) => setStayAt(i, n)}
              onRemove={() => removeStayAt(i)}
              excludeSlugs={usedSlugs.filter(
                (slug) => slug !== s.place?.slug,
              )}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addStay}
          className="font-sans"
        >
          <Plus className="h-3.5 w-3.5" />
          Add another city
        </Button>
      </div>

      {fieldError && (
        <div
          role="alert"
          className="rounded-sm border border-destructive/40 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive"
        >
          {fieldError}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="hidden max-w-md text-xs leading-relaxed text-muted-foreground md:block">
          Twelve readings of your climate. Data comes only from the pre-built
          v0.2 archive — no live APIs are consulted at exhibition time.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="min-w-44 font-sans uppercase tracking-[0.18em] text-xs"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Casting…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Cast my kundli
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
