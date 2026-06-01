import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { Button } from '@/components/ui/button'
import { KundliResultLayout } from '@/expt/KundliResultLayout'
import { fetchKundliBySlug, type MonthlyDeltaResponse } from '@/lib/api'

export function KundliViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<MonthlyDeltaResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) {
      setError('Kundli not found')
      setLoading(false)
      return
    }

    let cancelled = false

    fetchKundliBySlug(slug)
      .then((record) => {
        if (!cancelled) {
          setData(record.result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null)
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
          <p className="text-sm text-muted-foreground">Loading kundli…</p>
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

        {!loading && data ? (
          <MonthlyDeltaChart
            data={data}
            onReset={() => navigate('/')}
          />
        ) : null}
      </div>
    </KundliResultLayout>
  )
}
