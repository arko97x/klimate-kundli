// Live dithered portrait. The frame is shrunk to a coarse grid first, so the
// output can't carry more detail than the grid allows; that low resolution,
// not the dither pattern, is what cuts the identifying detail. Atkinson
// error diffusion then renders it as ink dots: dark pixels become ink,
// light ones stay transparent so the paper shows through.

export const DITHER_WIDTH = 112
export const DITHER_HEIGHT = 140 // 4:5 portrait

const INK: [number, number, number] = [28, 25, 23]

/**
 * Draws the centre 4:5 crop of `video` into `work` at dither resolution,
 * mirrored like a selfie, and writes the dithered result into `out`.
 * Both canvases must be DITHER_WIDTH × DITHER_HEIGHT.
 */
export function ditherFrame(
  video: HTMLVideoElement,
  work: CanvasRenderingContext2D,
  out: CanvasRenderingContext2D,
): void {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  const target = DITHER_WIDTH / DITHER_HEIGHT
  let sw = vw
  let sh = vw / target
  if (sh > vh) {
    sh = vh
    sw = vh * target
  }
  const sx = (vw - sw) / 2
  const sy = (vh - sh) / 2

  work.save()
  work.setTransform(-1, 0, 0, 1, DITHER_WIDTH, 0)
  work.drawImage(video, sx, sy, sw, sh, 0, 0, DITHER_WIDTH, DITHER_HEIGHT)
  work.restore()

  const src = work.getImageData(0, 0, DITHER_WIDTH, DITHER_HEIGHT).data
  const n = DITHER_WIDTH * DITHER_HEIGHT
  const lum = new Float32Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i += 1) {
    const l = 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]
    lum[i] = l
    hist[l | 0] += 1
  }

  // Stretch between the 2nd and 98th percentile so dim booth lighting still
  // produces a readable portrait rather than a solid black block.
  const lo = percentile(hist, n * 0.02)
  const hi = Math.max(lo + 1, percentile(hist, n * 0.98))
  for (let i = 0; i < n; i += 1) {
    lum[i] = Math.min(255, Math.max(0, ((lum[i] - lo) / (hi - lo)) * 255))
  }

  const img = out.createImageData(DITHER_WIDTH, DITHER_HEIGHT)
  const px = img.data
  for (let y = 0; y < DITHER_HEIGHT; y += 1) {
    for (let x = 0; x < DITHER_WIDTH; x += 1) {
      const i = y * DITHER_WIDTH + x
      const old = lum[i]
      const ink = old < 128
      const err = (old - (ink ? 0 : 255)) / 8
      spread(lum, x + 1, y, err)
      spread(lum, x + 2, y, err)
      spread(lum, x - 1, y + 1, err)
      spread(lum, x, y + 1, err)
      spread(lum, x + 1, y + 1, err)
      spread(lum, x, y + 2, err)
      if (ink) {
        px[i * 4] = INK[0]
        px[i * 4 + 1] = INK[1]
        px[i * 4 + 2] = INK[2]
        px[i * 4 + 3] = 255
      }
    }
  }
  out.putImageData(img, 0, 0)
}

function spread(lum: Float32Array, x: number, y: number, err: number) {
  if (x < 0 || x >= DITHER_WIDTH || y >= DITHER_HEIGHT) return
  lum[y * DITHER_WIDTH + x] += err
}

function percentile(hist: Uint32Array, rank: number): number {
  let seen = 0
  for (let v = 0; v < 256; v += 1) {
    seen += hist[v]
    if (seen >= rank) return v
  }
  return 255
}
