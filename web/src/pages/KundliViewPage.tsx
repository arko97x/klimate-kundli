import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'

import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { PrintableKundli } from '@/components/PrintableKundli'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { KundliResultLayout } from '@/expt/KundliResultLayout'
import { fetchKundliBySlug, type SavedKundliRecord } from '@/lib/api'
import { useIsExhibition } from '@/lib/exhibition-context'

export function KundliViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const isExhibition = useIsExhibition()
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
      <div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading kundli...</p>
        ) : null}

        {!loading && error ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(isExhibition ? '/exhibition' : '/')}>
              Make your own
            </Button>
          </div>
        ) : null}

        {!loading && record ? (
          <>
            <div className="mb-6 flex justify-end">
              <Dialog>
                <DialogTrigger render={<Button type="button" size="sm" className="gap-2" />}>
                  <Printer className="size-4" />
                  Print Kundli
                </DialogTrigger>
                <DialogContent className="max-w-[min(92vw,560px)] p-4">
                  <DialogTitle className="sr-only">Printable kundli preview</DialogTitle>
                  <PrintableKundli
                    data={record.result}
                    birthPlace={record.birthCityDisplay}
                    shareUrl={`${window.location.origin}/k/${slug}`}
                    className="w-full aspect-[210/297] border border-border shadow-sm"
                  />
                </DialogContent>
              </Dialog>
            </div>

            <MonthlyDeltaChart
              data={record.result}
              livedCities={record.livedCities}
              shareUrl={`${window.location.origin}/k/${slug}`}
              onReset={() => navigate(isExhibition ? '/exhibition' : '/')}
            />
          </>
        ) : null}
      </div>
    </KundliResultLayout>
  )
}

