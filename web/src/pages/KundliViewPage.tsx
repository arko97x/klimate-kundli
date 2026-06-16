import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { KundliSnapshotFrame } from '@/components/KundliSnapshotFrame'
import { Button } from '@/components/ui/button'
import { KundliResultLayout } from '@/expt/KundliResultLayout'
import { fetchKundliBySlug, type SavedKundliRecord } from '@/lib/api'

const SNAPSHOT_POLL_MS = 3_000

export function KundliViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [record, setRecord] = useState<SavedKundliRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) {
      setError('Kundli not found')
      setLoading(false)
      return
    }

    let cancelled = false
    let intervalId: number | undefined

    const load = (isPoll = false) => {
      if (!isPoll) {
        setLoading(true)
      }

      fetchKundliBySlug(slug)
        .then((record) => {
          if (cancelled) {
            return
          }

          setRecord(record)
          setError(null)

          if (record.snapshot?.chunks.length && intervalId != null) {
            window.clearInterval(intervalId)
            intervalId = undefined
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setRecord(null)
            setError(err instanceof Error ? err.message : 'Could not load kundli')
          }
        })
        .finally(() => {
          if (!cancelled && !isPoll) {
            setLoading(false)
          }
        })
    }

    load()
    intervalId = window.setInterval(() => {
      if (!cancelled) {
        load(true)
      }
    }, SNAPSHOT_POLL_MS)

    return () => {
      cancelled = true
      if (intervalId != null) {
        window.clearInterval(intervalId)
      }
    }
  }, [slug])

  return (
    <KundliResultLayout>
      <div className="p-6 pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading kundli...</p>
        ) : null}

        {!loading && error ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/')}>
              Make your own
            </Button>
          </div>
        ) : null}

        {!loading && record?.snapshot?.chunks.length ? (
          <KundliSnapshotFrame
            snapshot={record.snapshot}
            createdAt={record.createdAt}
            birthCityDisplay={record.birthCityDisplay}
            birthYear={record.birthYear}
          />
        ) : null}

        {!loading && record && !record.snapshot?.chunks.length ? (
          <SnapshotPending
            birthCityDisplay={record.birthCityDisplay}
            birthYear={record.birthYear}
            createdAt={record.createdAt}
          />
        ) : null}
      </div>
    </KundliResultLayout>
  )
}

function SnapshotPending({
  birthCityDisplay,
  birthYear,
  createdAt,
}: {
  birthCityDisplay: string
  birthYear: number
  createdAt: string
}) {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center">
      <div className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
          <span className="size-8 animate-pulse rounded-full bg-foreground/70" aria-hidden />
        </div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Freezing Kundli
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {shortCity(birthCityDisplay)}, {birthYear}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
          Your generated design is being snapshotted. This page will switch to the frozen view automatically.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Created {formatCreatedAt(createdAt)} · checking every few seconds
        </p>
      </div>
    </section>
  )
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function shortCity(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName
}
