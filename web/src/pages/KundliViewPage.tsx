import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'

import { MonthlyDeltaChart } from '@/components/MonthlyDeltaChart'
import { PrintableKundli } from '@/components/PrintableKundli'
import { Button, buttonVariants } from '@/components/ui/button'
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

  // Slug-page header actions: Print (native to this kundli, only once it's
  // loaded) as the primary button, and New Kundli as an outline button.
  const headerActions = (
    <>
      {!loading && record ? (
        <Button
          type="button"
          className="gap-2"
          onClick={() => window.print()}
        >
          <Printer className="size-4" />
          Print Kundli
        </Button>
      ) : null}
      <Link to="/exhibition" className={buttonVariants({ variant: 'outline' })}>
        New Kundli
      </Link>
    </>
  )

  return (
    <KundliResultLayout headerActions={headerActions}>
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
            {/* Print rules: exact A4, no margins. Hide the whole app and show only
                the printable sheet (portaled to <body>, so it's a sibling of #root
                — not a descendant of the tall result page). That keeps the output a
                single A4 page instead of paginating the on-screen content.

                iOS Safari note: its print engine snapshots what's already been
                painted, so we must NOT use `display:none → block` or `position:fixed`
                for the sheet — either one yields a blank PDF and wild zoom on iPad.
                Instead the sheet stays in the render tree, parked off-screen with a
                fixed position (no flow impact, no scrollbars), and prints in static
                flow. */}
            <style>{`
              #kundli-print-root {
                position: fixed;
                top: 0;
                left: -9999px;
              }
              @media print {
                @page { size: A4 portrait; margin: 0; }
                /* Pin the print viewport to exactly one A4 page and clip the rest.
                   iOS Safari ignores @page margin:0 and reserves its own printable
                   margin, so overflowing content wraps to a phantom second page —
                   constraining body to a single page height removes anything for it
                   to paginate onto. */
                html, body {
                  margin: 0 !important; padding: 0 !important;
                  width: 210mm !important; height: 297mm !important;
                  overflow: hidden !important;
                  background: #fff !important;
                }
                #root { display: none !important; }
                #kundli-print-root {
                  position: static !important;
                  left: 0 !important;
                  width: 210mm !important; height: 297mm !important;
                  overflow: hidden !important;
                }
                /* height a hair under 297mm: an exact-A4 box gets tipped onto a
                   blank second page by sub-pixel mm→px rounding. */
                #kundli-sheet {
                  width: 210mm; height: 296mm;
                  overflow: hidden !important;
                  box-shadow: none !important;
                }
              }
            `}</style>

            {createPortal(
              <div id="kundli-print-root">
                <PrintableKundli
                  data={record.result}
                  birthPlace={record.birthCityDisplay}
                  shareUrl={`${window.location.origin}/k/${slug}`}
                  className="w-[210mm] h-[297mm] bg-white"
                />
              </div>,
              document.body,
            )}

            <MonthlyDeltaChart
              data={record.result}
              livedCities={record.livedCities}
              shareUrl={`${window.location.origin}/k/${slug}`}
              onReset={() => navigate('/exhibition')}
            />
          </>
        ) : null}
      </div>
    </KundliResultLayout>
  )
}

