import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { KundliResultLayout } from '@/expt/KundliResultLayout'
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
    <KundliResultLayout>
      <main
        className="p-6 pt-0"
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
    </KundliResultLayout>
  )
}
