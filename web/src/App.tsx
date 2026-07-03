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
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App

