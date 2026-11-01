import type { Step } from './types'

const road = (s: Step) => (s.name && s.ref ? `${s.name} (${s.ref})` : s.name || s.ref || 'the road')

/** Plain-language instruction for one OSRM maneuver. */
export function describeStep(s: Step): string {
  const mod = s.modifier
  switch (s.type) {
    case 'depart':
      return `Start on ${road(s)}`
    case 'arrive':
      return mod === 'left' || mod === 'right' ? `Arrive at your destination, on the ${mod}` : 'Arrive at your destination'
    case 'turn':
      return mod === 'straight' ? `Continue straight onto ${road(s)}` : mod === 'uturn' ? `Make a U-turn onto ${road(s)}` : `Turn ${mod} onto ${road(s)}`
    case 'end of road':
      return `Turn ${mod || 'ahead'} onto ${road(s)} at the end of the road`
    case 'merge':
      return `Merge ${mod || ''} onto ${road(s)}`.replace('  ', ' ')
    case 'on ramp':
      return `Take the ramp ${mod ? `on the ${mod} ` : ''}onto ${road(s)}`
    case 'off ramp':
      return `Take the exit ${mod ? `on the ${mod} ` : ''}onto ${road(s)}`
    case 'fork':
      return `Keep ${mod || 'ahead'} onto ${road(s)}`
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return s.exit ? `At the roundabout, take exit ${s.exit} onto ${road(s)}` : `Enter the roundabout and continue onto ${road(s)}`
    case 'continue':
      return mod && mod !== 'straight' ? `Continue ${mod} on ${road(s)}` : `Continue on ${road(s)}`
    default:
      return `Continue onto ${road(s)}`
  }
}

/** Which icon family to show for a maneuver. */
export type Glyph = 'depart' | 'arrive' | 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'uturn' | 'roundabout' | 'merge'

export function glyphFor(s: Step): Glyph {
  if (s.type === 'depart') return 'depart'
  if (s.type === 'arrive') return 'arrive'
  if (s.type === 'roundabout' || s.type === 'rotary' || s.type === 'roundabout turn') return 'roundabout'
  if (s.type === 'merge') return 'merge'
  switch (s.modifier) {
    case 'left':
      return 'left'
    case 'right':
      return 'right'
    case 'slight left':
      return 'slight-left'
    case 'slight right':
      return 'slight-right'
    case 'sharp left':
      return 'sharp-left'
    case 'sharp right':
      return 'sharp-right'
    case 'uturn':
      return 'uturn'
    default:
      return 'straight'
  }
}

/** Distance in a driver-friendly unit: feet when close, miles otherwise. */
export function fmtAhead(miles: number): string {
  if (miles < 0.1) return `${Math.max(50, Math.round((miles * 5280) / 50) * 50)} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

/** Miles from the route start at which each step's maneuver happens. */
export function stepStarts(steps: Step[]): number[] {
  const out: number[] = []
  let run = 0
  for (const s of steps) {
    out.push(run)
    run += s.distance_miles
  }
  return out
}
