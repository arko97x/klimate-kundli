/** Tree rings: one shared angular wiggle so every band stays nested (no crossing). */

const N_POINTS = 160
const WIGGLE_PARAM = 0.02
/** Visual only — bump for more organic tree-slice feel. */
const WIGGLE_AMP = 11

/**
 * Same offset at a given angle for every radius — inner/outer edges stay parallel.
 */
export function sharedWiggleOffset(angle: number, perm: number[]): number {
  const x0 = WIGGLE_PARAM * (100 + 100 * Math.cos(angle))
  const y0 = WIGGLE_PARAM * (100 + 100 * Math.sin(angle))
  const n = perlin2(x0, y0, perm)
  return (n - 0.5) * 2 * WIGGLE_AMP
}

/** Filled band between two base radii, sharing one noise field. */
export function parallelAnnulusPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  perm: number[],
): string {
  if (outerR <= innerR + 0.05) return ''

  const outerPts: { x: number; y: number }[] = []
  const innerPts: { x: number; y: number }[] = []

  for (let i = 0; i <= N_POINTS; i += 1) {
    const angle = (i / N_POINTS) * Math.PI * 2
    const w = sharedWiggleOffset(angle, perm)
    outerPts.push({
      x: cx + (outerR + w) * Math.cos(angle),
      y: cy + (outerR + w) * Math.sin(angle),
    })
    innerPts.push({
      x: cx + (innerR + w) * Math.cos(angle),
      y: cy + (innerR + w) * Math.sin(angle),
    })
  }

  let d = `M ${outerPts[0]!.x} ${outerPts[0]!.y} `
  for (let i = 1; i < outerPts.length; i += 1) {
    d += `L ${outerPts[i]!.x} ${outerPts[i]!.y} `
  }
  for (let i = innerPts.length - 1; i >= 0; i -= 1) {
    d += `L ${innerPts[i]!.x} ${innerPts[i]!.y} `
  }
  d += 'Z'
  return d
}

export function permutationForSeed(seed: number): number[] {
  const p = Array.from({ length: 256 }, (_, i) => i)
  let state = seed >>> 0
  for (let i = 255; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const j = state % (i + 1)
    const tmp = p[i]!
    p[i] = p[j]!
    p[j] = tmp
  }
  return [...p, ...p]
}

function perlin2(x: number, y: number, perm: number[]): number {
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const u = fade(xf)
  const v = fade(yf)

  const aa = perm[(perm[xi]! + yi) & 255]!
  const ab = perm[(perm[xi]! + yi + 1) & 255]!
  const ba = perm[(perm[(xi + 1) & 255]! + yi) & 255]!
  const bb = perm[(perm[(xi + 1) & 255]! + yi + 1) & 255]!

  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
  return (lerp(x1, x2, v) + 1) / 2
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}
