import type { MonthlyDeltaResponse } from '@/lib/api'
import type { City } from '@/types'

import type { MoveEvent } from './journey'

// Everything the visitor enters lives here, in memory only: the LinkedIn URL
// and dithered photo are never sent or stored (DesignUp event data has no
// backend yet), and a refresh deliberately starts the flow over.

export type FlowState = {
  linkedIn: string | null
  /** PNG data URL of the dithered capture. The raw camera frame is never kept. */
  photo: string | null
  birthCity: City | null
  birthYear: number | null
  moves: MoveEvent[]
  /** The visitor answered "no more moves", so the journey can be reviewed. */
  settled: boolean
  result: MonthlyDeltaResponse | null
}

export const EMPTY_FLOW: FlowState = {
  linkedIn: null,
  photo: null,
  birthCity: null,
  birthYear: null,
  moves: [],
  settled: false,
  result: null,
}

export const STEPS = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'photo', label: 'Photo' },
  { key: 'birth', label: 'Birth' },
  { key: 'places', label: 'Places' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

export const BASE = '/dup-test'

export function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key)
}

/** The earliest top-level step the visitor hasn't finished. */
export function firstIncompleteStep(state: FlowState): StepKey | null {
  if (!state.linkedIn) return 'linkedin'
  if (!state.photo) return 'photo'
  if (!state.birthCity || state.birthYear === null) return 'birth'
  if (placesPath(state) !== `${BASE}/places/review`) return 'places'
  return null
}

/** Where the places sub-flow should resume: the first unanswered question. */
export function placesPath(state: FlowState): string {
  for (let i = 0; i < state.moves.length; i += 1) {
    const move = state.moves[i]
    if (!move.city) return `${BASE}/places/move/${i + 1}/city`
    if (move.year === null) return `${BASE}/places/move/${i + 1}/year`
  }
  if (!state.settled) return `${BASE}/places/move/${state.moves.length + 1}`
  return `${BASE}/places/review`
}

export function stepPath(key: StepKey, state: FlowState): string {
  return key === 'places' ? placesPath(state) : `${BASE}/${key}`
}
