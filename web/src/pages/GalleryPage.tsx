import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { KundliResultLayout } from "@/expt/KundliResultLayout";
import { fetchAllKundliList, type SavedKundliSummary } from "@/lib/api";
import { isMyKundli } from "@/lib/my-kundlis";

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function KundliCard({ item }: { item: SavedKundliSummary }) {
  const mine = isMyKundli(item.slug);
  const createdLabel = formatCreatedAt(item.createdAt);

  return (
    <Link
      to={`/k/${item.slug}`}
      className="block rounded-md border border-border bg-background p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{item.birthCityDisplay}</p>
          <p className="text-sm text-muted-foreground">Born {item.birthYear}</p>
        </div>
        {mine ? (
          <span className="shrink-0 rounded-full bg-linear-to-b from-[#180033] to-[#bd005d] px-2.5 py-0.5 text-xs font-medium text-white">
            You
          </span>
        ) : null}
      </div>
      {createdLabel ? (
        <p className="mt-3 text-xs text-muted-foreground">{createdLabel}</p>
      ) : null}
    </Link>
  );
}

export function GalleryPage() {
  const [items, setItems] = useState<SavedKundliSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchAllKundliList()
      .then((next) => {
        if (!cancelled) {
          setItems(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setError(
            err instanceof Error ? err.message : "Could not load gallery",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const emptyMessage = useMemo(() => {
    if (loading) {
      return null;
    }
    if (error) {
      return error;
    }
    if (items.length === 0) {
      return "No kundlis yet. Be the first.";
    }
    return null;
  }, [error, items.length, loading]);

  return (
    <KundliResultLayout>
      <div className="space-y-6 p-6 pt-0">
        <header className="space-y-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Gallery
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-lg">
            Every generated kundli is saved automatically. Completely anonymous.
            Links are shareable.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading kundlis…</p>
        ) : null}

        {emptyMessage ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.slug}>
                <KundliCard item={item} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </KundliResultLayout>
  );
}
