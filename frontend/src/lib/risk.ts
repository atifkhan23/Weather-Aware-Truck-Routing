import type { LevelKey } from './types'

export const LEVELS: { key: LevelKey; label: string; color: string }[] = [
  { key: 'low', label: 'Low', color: '#4cae72' },
  { key: 'moderate', label: 'Moderate', color: '#e0b43a' },
  { key: 'high', label: 'High', color: '#e5833a' },
  { key: 'severe', label: 'Severe', color: '#dc4a42' },
  { key: 'no_travel', label: 'No Travel', color: '#a65bd1' },
]

export const ROUTE_COLORS: Record<string, string> = { a: '#5aa0e0', b: '#e8e4d8', c: '#c58fd9' }

export const UNKNOWN = { key: 'unknown' as const, label: 'No forecast', color: '#6b7a90' }

export const levelColor = (key: LevelKey): string =>
  LEVELS.find((l) => l.key === key)?.color ?? UNKNOWN.color

export const levelLabel = (key: LevelKey): string =>
  LEVELS.find((l) => l.key === key)?.label ?? UNKNOWN.label

const RGB = LEVELS.map((l) => {
  const n = parseInt(l.color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
})

/**
 * Heatmap colour for a continuous risk score in [0, 5): the integer part is the
 * discrete level, the fraction blends toward the next level. Calm weather is
 * almost transparent so the map stays readable; dangerous weather is opaque.
 */
export function scoreToRgba(score: number): [number, number, number, number] {
  if (score < 0) return [0, 0, 0, 0]
  const level = Math.min(4, Math.floor(score))
  const t = Math.min(1, score - level)
  const a = RGB[level]
  const b = RGB[Math.min(4, level + 1)]
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t * 0.6)
  // Low risk fades in from fully transparent so calm areas leave the map clean.
  const alpha = level === 0 ? Math.max(0, t - 0.5) * 0.5 : [0, 0.42, 0.58, 0.72, 0.82][level] + t * 0.08
  return [mix(0), mix(1), mix(2), Math.round(Math.min(0.9, alpha) * 255)]
}
