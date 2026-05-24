import { BrowserRouter, Route, Routes } from 'react-router-dom'

import KundliApp from '@/KundliApp'
import { DocumentationPage } from '@/documentation/DocumentationPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<KundliApp />} />
        <Route path="/documentation" element={<DocumentationPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
