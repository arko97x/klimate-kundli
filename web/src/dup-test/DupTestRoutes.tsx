import { Navigate, Route, Routes } from 'react-router-dom'

import { DupTestPage } from '@/pages/DupTestPage'

import { BirthStep } from './BirthStep'
import { DoneStep } from './DoneStep'
import { FlowLayout, StepGuard } from './FlowLayout'
import { FlowProvider } from './FlowProvider'
import { LinkedInStep } from './LinkedInStep'
import { MoveCity, MoveQuestion, MoveYear, PlacesIndex, Review } from './PlacesSteps'
import { PhotoStep } from './PhotoStep'

// Everything under /dup-test. Lazy-loaded from App.tsx so the camera, QR and
// flow code never reach the bundle of the existing public pages.
export default function DupTestRoutes() {
  return (
    <FlowProvider>
      <Routes>
        <Route index element={<DupTestPage />} />
        <Route element={<FlowLayout />}>
          <Route path="linkedin" element={<LinkedInStep />} />
          <Route path="photo" element={<StepGuard step="photo"><PhotoStep /></StepGuard>} />
          <Route path="birth" element={<StepGuard step="birth"><BirthStep /></StepGuard>} />
          <Route path="places">
            <Route index element={<StepGuard step="places"><PlacesIndex /></StepGuard>} />
            <Route path="move/:n" element={<StepGuard step="places"><MoveQuestion /></StepGuard>} />
            <Route path="move/:n/city" element={<StepGuard step="places"><MoveCity /></StepGuard>} />
            <Route path="move/:n/year" element={<StepGuard step="places"><MoveYear /></StepGuard>} />
            <Route path="review" element={<StepGuard step="places"><Review /></StepGuard>} />
          </Route>
          <Route path="done" element={<DoneStep />} />
        </Route>
        <Route path="*" element={<Navigate to="/dup-test" replace />} />
      </Routes>
    </FlowProvider>
  )
}
