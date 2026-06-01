import { BrowserRouter, Route, Routes } from 'react-router-dom'

import KundliApp from '@/KundliApp'
import { DocumentationPage } from '@/documentation/DocumentationPage'
import { TooltipProvider } from '@/components/ui/tooltip'

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<KundliApp />} />
          <Route path="/documentation" element={<DocumentationPage />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
