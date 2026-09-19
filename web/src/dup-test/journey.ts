import { stintEndDate, stintStartDate } from '@/lib/lived-cities'
import type { City, LivedCity } from '@/types'

/**
 * One move after birth: the city that became home, and roughly when. The
 * visitor reports moves; the residence ranges the API wants are derived.
 * Both fields start empty while the visitor is still answering.
 */
export type MoveEvent = {
  city: City | null
  year: number | null
}

export type CompleteMove = { city: City; year: number }

export function isCompleteMove(move: MoveEvent): move is CompleteMove {
  return move.city !== null && move.year !== null
}

/**
 * Turns birth + ordered moves into the API's LivedCity[] (see
 * docs/EXPERIENCE_REDESIGN_HANDOFF.md): each residence starts 1 Jan of its
 * move year and ends 31 Dec of the year before the next move; the last one is
 * open-ended. Move years must strictly increase, which the UI guarantees.
 */
export function movesToLivedCities(
  birthCity: City,
  birthYear: number,
  moves: CompleteMove[],
): LivedCity[] {
  const stops = [{ city: birthCity, year: birthYear }, ...moves]
  return stops.map((stop, i) => {
    const next = stops[i + 1]
    return {
      ...stop.city,
      start: stintStartDate(stop.year),
      end: next ? stintEndDate(next.year - 1) : null,
    }
  })
}

/**
 * The years a move at `index` may take: after the previous stop, before the
 * next move (if that one already has a year), and no later than the latest
 * complete year. Empty when there's no room.
 */
export function moveYearBounds(
  index: number,
  birthYear: number,
  moves: MoveEvent[],
  latestYear: number,
): { min: number; max: number } {
  const prevYear = index === 0 ? birthYear : (moves[index - 1]?.year ?? birthYear)
  const nextYear = moves[index + 1]?.year ?? null
  return {
    min: prevYear + 1,
    max: nextYear !== null ? nextYear - 1 : latestYear,
  }
}

/**
 * Clears move years that no longer fit (after the birth year or an earlier
 * move changed), so the flow sends the visitor back to re-pick them rather
 * than generating an overlapping timeline.
 */
export function clearInvalidMoveYears(birthYear: number, moves: MoveEvent[]): MoveEvent[] {
  let prev = birthYear
  return moves.map((move) => {
    if (move.year === null) return move
    if (move.year <= prev) return { ...move, year: null }
    prev = move.year
    return move
  })
}

/**
 * Pulls a LinkedIn profile URL out of scanned QR text. Accepts
 * linkedin.com/in/<handle> on any linkedin.com subdomain, with or without a
 * scheme, and drops tracking params. Returns null for anything else.
 */
export function parseLinkedInProfile(text: string): string | null {
  const raw = text.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null
  const match = url.pathname.match(/^\/in\/([^/]+)\/?$/)
  if (!match) return null
  return `https://www.linkedin.com/in/${match[1]}`
}
