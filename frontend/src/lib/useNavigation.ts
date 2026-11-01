import { useEffect, useState } from 'react'

export interface DriverFix {
  lat: number
  lon: number
  accuracyMeters: number
  headingDeg: number | null
  speedMph: number | null
  /** When the fix was taken (ms since 1970). */
  at: number
}

const MPS_TO_MPH = 2.23694

function explain(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return 'Location permission was denied. Allow location access in your browser to follow the route live.'
  if (err.code === err.POSITION_UNAVAILABLE) return 'Your position is not available right now. Check that location services are on.'
  return 'Finding your location took too long. Try again in an open area.'
}

/** Follows the driver with the browser's GPS while ``active``. Needs HTTPS (localhost counts) and the driver's permission. */
export function useNavigation(active: boolean): { fix: DriverFix | null; error: string | null } {
  const [fix, setFix] = useState<DriverFix | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    if (!('geolocation' in navigator)) {
      const id = window.setTimeout(() => setError('This browser cannot share your location.'), 0)
      return () => window.clearTimeout(id)
    }
    let watch: number
    try {
      watch = navigator.geolocation.watchPosition(
      (pos) => {
        if (!Number.isFinite(pos.coords.latitude) || !Number.isFinite(pos.coords.longitude)) return
        setError(null)
        setFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          headingDeg: pos.coords.heading ?? null,
          speedMph: pos.coords.speed != null ? pos.coords.speed * MPS_TO_MPH : null,
          at: pos.timestamp,
        })
      },
      (err) => setError(explain(err)),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
      )
    } catch {
      // Blocked by the browser or a permissions policy: navigation is unavailable, nothing else is affected.
      const id = window.setTimeout(() => setError('Location is blocked in this browser, so live navigation is unavailable.'), 0)
      return () => window.clearTimeout(id)
    }
    return () => {
      try {
        navigator.geolocation.clearWatch(watch)
      } catch {
        /* nothing to clean up */
      }
    }
  }, [active])

  // Nothing is reported while navigation is off, so stale fixes never leak into the next trip.
  return active ? { fix, error } : { fix: null, error: null }
}
