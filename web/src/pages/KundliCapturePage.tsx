import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { fetchKundliBySlug, type SavedKundliRecord } from '@/lib/api'

export function KundliCapturePage() {
  const { slug } = useParams<{ slug: string }>()
  const [record, setRecord] = useState<SavedKundliRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setError('Kundli not found')
      return
    }

    let cancelled = false
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

    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main
        className="mx-auto w-full max-w-4xl p-6"
        data-kundli-capture-root
        data-kundli-capture-ready={record ? 'true' : undefined}
      >
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {record ? (
          <MonthlyDeltaChart data={record.result} livedCities={record.livedCities} />
        ) : null}
      </main>
    </div>
  )
}
