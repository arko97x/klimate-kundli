import { Outlet } from 'react-router-dom'
import { ExhibitionProvider } from '@/lib/exhibition-context'

export function ExhibitionLayout() {
  return (
    <ExhibitionProvider value={true}>
      <Outlet />
    </ExhibitionProvider>
  )
}

export function PublicLayout() {
  return (
    <ExhibitionProvider value={false}>
      <Outlet />
    </ExhibitionProvider>
  )
}
