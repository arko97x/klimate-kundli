import { sharedWiggleOffset } from '@/lib/organicTreeRing'

/** Closed organic blob (top-down floe) of base radius R, reusing the tree-ring noise field. */
export function organicBlobPath(cx: number, cy: number, r: number, perm: number[], n = 140): string {
  let d = ''
  for (let i = 0; i <= n; i += 1) {
    const angle = (i / n) * Math.PI * 2
    const rr = r + sharedWiggleOffset(angle, perm) * (r / 100)
    const x = cx + rr * Math.cos(angle)
    const y = cy + rr * Math.sin(angle)
    d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d + ' Z'
}

/** Ice palette shared across the prototypes so they read as a family. */
export const ICE = {
  water: '#0c2030',
  waterDeep: '#081722',
  iceLight: '#eaf7fc',
  iceMid: '#bfe3f0',
  iceShadow: '#8cc4d8',
  teal: '#3aa6c0',
  ghost: 'rgba(234, 247, 252, 0.18)',
  ghostLine: 'rgba(234, 247, 252, 0.45)',
} as const
