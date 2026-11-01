/** Time formatting in an explicit IANA zone (the trip's local zone), not the browser's. */

const LOCALE = 'en-US'
const fmtCache = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts)
  let f = fmtCache.get(key)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...opts })
    } catch {
      f = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...opts })
    }
    fmtCache.set(key, f)
  }
  return f
}

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Short zone label such as "CST" or "CDT" (falls back to "GMT-6" style outside the US). */
export function zoneAbbr(tz: string, at: Date | string = new Date()): string {
  const date = typeof at === 'string' ? new Date(at) : at
  return formatter(tz, { timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? tz
}

export const fmtTime = (iso: string, tz: string, withZone = false) => {
  const t = formatter(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  return withZone ? `${t} ${zoneAbbr(tz, iso)}` : t
}

export const fmtDayTime = (iso: string, tz: string, withZone = false) => {
  const t = formatter(tz, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  return withZone ? `${t} ${zoneAbbr(tz, iso)}` : t
}

export function fmtDuration(seconds: number): string {
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/** Signed difference such as "+42 min" or "−1 h 05 min". */
export function fmtDelta(seconds: number): string {
  const sign = seconds < 0 ? '−' : '+'
  return `${sign}${fmtDuration(Math.abs(seconds))}`
}

export const fmtMiles = (miles: number) =>
  `${miles.toLocaleString(undefined, { maximumFractionDigits: miles < 10 ? 1 : 0 })} mi`

export const fmtWeight = (lb: number) => `${lb.toLocaleString()} lb`

/** Value for <input type="datetime-local"> showing ``date`` as wall-clock time in ``tz``. */
export function toZonedInput(date: Date, tz: string): string {
  const parts = Object.fromEntries(
    formatter(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function offsetMs(tz: string, ms: number): number {
  const p = Object.fromEntries(
    formatter(tz, {
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, Number(x.value)]),
  )
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** Interprets a datetime-local string as wall-clock time in ``tz`` and returns the real instant. */
export function zonedInputToDate(value: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return new Date(NaN)
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let utc = wall - offsetMs(tz, wall)
  utc = wall - offsetMs(tz, utc) // re-check across a DST boundary
  return new Date(utc)
}
