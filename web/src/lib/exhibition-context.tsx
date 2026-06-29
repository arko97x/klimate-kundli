/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'

const ExhibitionContext = createContext<boolean>(false)

export function ExhibitionProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: boolean
}) {
  return (
    <ExhibitionContext.Provider value={value}>
      {children}
    </ExhibitionContext.Provider>
  )
}

export function useIsExhibition() {
  return useContext(ExhibitionContext)
}
