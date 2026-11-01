import { useMemo } from 'react'
import { ImageOverlay } from 'react-leaflet'
import { scoreToRgba } from '../lib/risk'
import type { Heatmap } from '../lib/types'

const UPSCALE = 12

/** Alpha multiplier by distance (in cells) from the grid edge, so the overlay fades into the map. */
const EDGE_FADE = [0.1, 0.45, 0.8]

/** Renders every forecast hour to an image once; the slider then just swaps images. */
function renderFrames(heatmap: Heatmap): string[] {
  const { rows, cols, scores, mask } = heatmap
  const small = document.createElement('canvas')
  small.width = cols
  small.height = rows
  const sctx = small.getContext('2d')
  const big = document.createElement('canvas')
  big.width = cols * UPSCALE
  big.height = rows * UPSCALE
  const bctx = big.getContext('2d')
  if (!sctx || !bctx) return []
  bctx.imageSmoothingEnabled = true
  bctx.imageSmoothingQuality = 'high'

  return scores.map((hour) => {
    const img = sctx.createImageData(cols, rows)
    for (let r = 0; r < rows; r++) {
      // Data rows start in the south; canvas rows start at the top (north).
      const y = rows - 1 - r
      for (let c = 0; c < cols; c++) {
        const [R, G, B, A0] = scoreToRgba(hour[r * cols + c])
        const edge = Math.min(r, c, rows - 1 - r, cols - 1 - c)
        const band = mask ? (mask[r * cols + c] ?? 1) : 1 // 1 inside the corridor, easing to 0 at its edge
        const A = Math.round((edge < EDGE_FADE.length ? A0 * EDGE_FADE[edge] : A0) * band)
        const o = (y * cols + c) * 4
        img.data[o] = R
        img.data[o + 1] = G
        img.data[o + 2] = B
        img.data[o + 3] = A
      }
    }
    sctx.putImageData(img, 0, 0)
    bctx.clearRect(0, 0, big.width, big.height)
    bctx.drawImage(small, 0, 0, big.width, big.height)
    return big.toDataURL('image/png')
  })
}

interface Props {
  heatmap: Heatmap
  hour: number
  opacity: number
}

export default function HeatmapOverlay({ heatmap, hour, opacity }: Props) {
  const frames = useMemo(() => renderFrames(heatmap), [heatmap])
  const { south, west, north, east } = heatmap.bounds
  const url = frames[Math.max(0, Math.min(frames.length - 1, hour))]
  if (!url) return null
  return (
    <ImageOverlay
      url={url}
      bounds={[
        [south, west],
        [north, east],
      ]}
      opacity={opacity}
      className="heatmap-overlay"
      zIndex={250}
    />
  )
}
