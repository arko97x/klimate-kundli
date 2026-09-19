import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import KundliApp from '@/KundliApp'
import { DocumentationPage } from '@/documentation/DocumentationPage'
import { GalleryPage } from '@/pages/GalleryPage'
import { IceLabPage } from '@/pages/IceLabPage'
import { KundliViewPage } from '@/pages/KundliViewPage'
import { NewDesignExperimentPage } from '@/pages/NewDesignExperimentPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExhibitionLayout, PublicLayout } from '@/components/Layouts'
import { AboutPage, DisclaimerPage, KlimateTwinPage, PrivacyPage } from '@/pages/StubPages'

// Experimental DesignUp flow; lazy so it adds nothing to the public pages' bundle.
const DupTestRoutes = lazy(() => import('@/dup-test/DupTestRoutes'))

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          {/* --- EXHIBITION LAYOUT (Distraction-Free) --- */}
          <Route element={<ExhibitionLayout />}>
            <Route path="/exhibition" element={<KundliApp />} />
          </Route>

          {/* --- PUBLIC SITE LAYOUT (Full Access) --- */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<KundliApp />} />
            <Route path="/k/:slug" element={<KundliViewPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/disclaimer" element={<DisclaimerPage />} />
            <Route path="/documentation" element={<DocumentationPage />} />
            <Route path="/klimate-twin" element={<KlimateTwinPage />} />
            <Route path="/ice-lab" element={<IceLabPage />} />
            <Route path="/new" element={<NewDesignExperimentPage />} />
            <Route
              path="/dup-test/*"
              element={
                <Suspense fallback={null}>
                  <DupTestRoutes />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App

