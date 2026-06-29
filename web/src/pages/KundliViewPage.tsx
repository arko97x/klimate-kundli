import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

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

        {!loading && record ? (
          <MonthlyDeltaChart
            data={record.result}
            livedCities={record.livedCities}
            onReset={() => navigate('/')}
          />
        ) : null}
      </div>
    </KundliResultLayout>
  )
}
