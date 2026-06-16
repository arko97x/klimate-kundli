import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { KundliSnapshotFrame } from '@/components/KundliSnapshotFrame'
import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { Button } from '@/components/ui/button'
import { KundliResultLayout } from '@/expt/KundliResultLayout'
import { fetchKundliBySlug, type SavedKundliRecord } from '@/lib/api'

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
    setLoading(true)

    fetchKundliBySlug(slug)
      .then((record) => {
        if (!cancelled) {
          setRecord(record)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRecord(null)
          setError(err instanceof Error ? err.message : 'Could not load kundli')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
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
          <>
            <SnapshotPending createdAt={record.createdAt} />
            <MonthlyDeltaChart
              data={record.result}
              livedCities={record.livedCities}
              onReset={() => navigate('/')}
            />
          </>
        ) : null}
      </div>
    </KundliResultLayout>
  )
}

function SnapshotPending({ createdAt }: { createdAt: string }) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="size-2.5 animate-pulse rounded-full bg-foreground/60" aria-hidden />
        <p>
          Snapshot freezing in background. This live preview will become a frozen kundli on refresh
          once capture finishes. Created {formatCreatedAt(createdAt)}.
        </p>
      </div>
    </div>
  )
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

