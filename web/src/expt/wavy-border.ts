/** Half peak-to-peak spacing along the border — matches original bottom strip rhythm. */
export const WAVE_PERIOD_PX = 12
export const WAVE_AMPLITUDE = 2
/** Room for wave peaks + 1px stroke so nothing clips. */
export const WAVE_BORDER_PAD = WAVE_AMPLITUDE + 1.5

type Point = { x: number; y: number }
type Frame = { left: number; top: number; right: number; bottom: number }

type EdgeSpec = {
  start: Point
  end: Point
  horizontal: boolean
  /** Unit normal pointing out of the frame interior (clockwise winding). */
  outward: Point
}

function frameFromSize(width: number, height: number, pad: number): Frame {
  return {
    left: pad,
    top: pad,
    right: width - pad,
    bottom: height - pad,
  }
}

function edgesClockwise(frame: Frame): EdgeSpec[] {
  const { left, top, right, bottom } = frame
  return [
    {
      start: { x: left, y: top },
      end: { x: right, y: top },
      horizontal: true,
      outward: { x: 0, y: -1 },
    },
    {
      start: { x: right, y: top },
      end: { x: right, y: bottom },
      horizontal: false,
      outward: { x: 1, y: 0 },
    },
    {
      start: { x: right, y: bottom },
      end: { x: left, y: bottom },
      horizontal: true,
      outward: { x: 0, y: 1 },
    },
    {
      start: { x: left, y: bottom },
      end: { x: left, y: top },
      horizontal: false,
      outward: { x: -1, y: 0 },
    },
  ]
}

function waveCountForLength(length: number, period: number) {
  return Math.max(1, Math.round(length / period))
}

function appendWaveSegment(
  path: string,
  start: Point,
  end: Point,
  horizontal: boolean,
  outward: Point,
  move: boolean,
  amplitude = WAVE_AMPLITUDE,
) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const along = Math.hypot(dx, dy)
  if (along <= 0) return path

  const tx = dx / along
  const ty = dy / along
  const twist = tx * outward.y - ty * outward.x
  const forward = twist > 0

  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
  const rx = horizontal ? along / 4 : amplitude
  const ry = horizontal ? amplitude : along / 4
  const sweep1 = forward ? 1 : 0
  const sweep0 = forward ? 0 : 1

  let d = move ? `${path}M${start.x},${start.y}` : path
  d += ` A${rx},${ry} 0 0,${sweep1} ${mid.x},${mid.y}`
  d += ` A${rx},${ry} 0 0,${sweep0} ${end.x},${end.y}`
  return d
}

function appendEdgeWaves(
  path: string,
  edge: EdgeSpec,
  move: boolean,
  amplitude = WAVE_AMPLITUDE,
  period = WAVE_PERIOD_PX,
) {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y)
  if (length <= 0) return path

  const count = waveCountForLength(length, period)
  let d = path
  let moved = !move

  for (let i = 0; i < count; i++) {
    const t0 = i / count
    const t1 = (i + 1) / count
    const segStart = {
      x: edge.start.x + (edge.end.x - edge.start.x) * t0,
      y: edge.start.y + (edge.end.y - edge.start.y) * t0,
    }
    const segEnd = {
      x: edge.start.x + (edge.end.x - edge.start.x) * t1,
      y: edge.start.y + (edge.end.y - edge.start.y) * t1,
    }
    d = appendWaveSegment(d, segStart, segEnd, edge.horizontal, edge.outward, !moved, amplitude)
    moved = true
  }

  return d
}

/** Wavy rect outline — two-arc crests tiled on each side. */
export function buildWavyRectPath(
  width: number,
  height: number,
  pad = WAVE_BORDER_PAD,
  amplitude = WAVE_AMPLITUDE,
  period = WAVE_PERIOD_PX,
) {
  const frame = frameFromSize(width, height, pad)
  if (frame.right - frame.left <= 0 || frame.bottom - frame.top <= 0) return ''

  let d = ''
  let move = true

  for (const edge of edgesClockwise(frame)) {
    d = appendEdgeWaves(d, edge, move, amplitude, period)
    move = false
  }

  return d
}

export function wavyBorderViewBox(width: number, height: number, pad = WAVE_BORDER_PAD) {
  return {
    x: -pad,
    y: -pad,
    width: width + pad * 2,
    height: height + pad * 2,
  }
}
