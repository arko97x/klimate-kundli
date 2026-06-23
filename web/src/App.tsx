import { BrowserRouter, Route, Routes } from 'react-router-dom'

import KundliApp from '@/KundliApp'
import { DocumentationPage } from '@/documentation/DocumentationPage'
import { GalleryPage } from '@/pages/GalleryPage'
import { IceLabPage } from '@/pages/IceLabPage'
import { KundliCapturePage } from '@/pages/KundliCapturePage'
import { KundliViewPage } from '@/pages/KundliViewPage'
import { NewDesignExperimentPage } from '@/pages/NewDesignExperimentPage'
import { TooltipProvider } from '@/components/ui/tooltip'

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<KundliApp />} />
          <Route path="/k/:slug" element={<KundliViewPage />} />
          <Route path="/capture/k/:slug" element={<KundliCapturePage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/ice-lab" element={<IceLabPage />} />
          <Route path="/new" element={<NewDesignExperimentPage />} />
          <Route path="/documentation" element={<DocumentationPage />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
