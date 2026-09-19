/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import type { MonthlyDeltaResponse } from '@/lib/api'
import { latestCompleteYearUtc } from '@/lib/years'
import type { City } from '@/types'

import { EMPTY_FLOW, type FlowState } from './flow'
import { clearInvalidMoveYears, type MoveEvent } from './journey'

type FlowContextValue = {
  state: FlowState
  latestYear: number
  setLinkedIn: (url: string | null) => void
  setPhoto: (dataUrl: string | null) => void
  setBirth: (city: City | null, year: number | null) => void
  setMoves: (moves: MoveEvent[], settled?: boolean) => void
  setSettled: (settled: boolean) => void
  setResult: (result: MonthlyDeltaResponse | null) => void
  reset: () => void
}

const FlowContext = createContext<FlowContextValue | null>(null)

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(EMPTY_FLOW)
  const latestYear = useMemo(() => latestCompleteYearUtc(), [])

  // Setters never change identity, so effects can depend on them freely.
  const actions = useMemo(
    () => ({
      setLinkedIn: (linkedIn: string | null) => setState((s) => ({ ...s, linkedIn, result: null })),
      setPhoto: (photo: string | null) => setState((s) => ({ ...s, photo, result: null })),
      setBirth: (birthCity: City | null, birthYear: number | null) =>
        setState((s) => ({
          ...s,
          birthCity,
          birthYear,
          moves: birthYear === null ? s.moves : clearInvalidMoveYears(birthYear, s.moves),
          result: null,
        })),
      setMoves: (moves: MoveEvent[], settled?: boolean) =>
        setState((s) => ({
          ...s,
          moves: s.birthYear === null ? moves : clearInvalidMoveYears(s.birthYear, moves),
          settled: settled ?? s.settled,
          result: null,
        })),
      setSettled: (settled: boolean) => setState((s) => ({ ...s, settled, result: null })),
      setResult: (result: MonthlyDeltaResponse | null) => setState((s) => ({ ...s, result })),
      reset: () => setState(EMPTY_FLOW),
    }),
    [],
  )

  const value = useMemo<FlowContextValue>(() => ({ state, latestYear, ...actions }), [state, latestYear, actions])

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow must be used inside FlowProvider')
  return ctx
}
