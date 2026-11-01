/** Small geometry helpers for following a route: distances are in miles, points are [lat, lon]. */
export type LatLon = [number, number]

const MILES_PER_DEG_LAT = 69.05
const toRad = (d: number) => (d * Math.PI) / 180

export function haversineMiles(a: LatLon, b: LatLon): number {
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * 3958.7613 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface Progress {
  /** Miles driven along the route at the closest point. */
  miles: number
  /** How far the position is from the route line. */
  offRouteMiles: number
}

/** Projects a GPS fix onto the route line to find how far along it the driver is. */
export function progressAlong(geometry: LatLon[], p: LatLon): Progress {
  let best = { miles: 0, offRouteMiles: Infinity }
  let run = 0
  const kx = Math.cos(toRad(p[0])) * MILES_PER_DEG_LAT
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1]
    const b = geometry[i]
    const ax = (a[1] - p[1]) * kx
    const ay = (a[0] - p[0]) * MILES_PER_DEG_LAT
    const bx = (b[1] - p[1]) * kx
    const by = (b[0] - p[0]) * MILES_PER_DEG_LAT
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const px = ax + t * dx
    const py = ay + t * dy
    const dist = Math.hypot(px, py)
    const seg = Math.sqrt(len2)
    if (dist < best.offRouteMiles) best = { miles: run + t * seg, offRouteMiles: dist }
    run += seg
  }
  return best
}

/** Length of the drawn line, to scale progress onto the route's reported distance. */
export function lineMiles(geometry: LatLon[]): number {
  let total = 0
  for (let i = 1; i < geometry.length; i++) total += haversineMiles(geometry[i - 1], geometry[i])
  return total
}
