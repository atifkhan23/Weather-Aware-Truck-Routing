import { useEffect, useMemo, useState } from 'react'
import { Box, Button, CircularProgress, InputAdornment, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import TripOriginRoundedIcon from '@mui/icons-material/TripOriginRounded'
import FlagRoundedIcon from '@mui/icons-material/FlagRounded'
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded'
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import PlaceField from './PlaceField'
import { fetchTimezone, reverseGeocode } from '../lib/api'
import { browserZone, toZonedInput, zoneAbbr, zonedInputToDate } from '../lib/format'
import { ink } from '../theme'
import type { Place, PlanRequest } from '../lib/types'

interface Props {
  initialOrigin?: Place | null
  initialDestination?: Place | null
  loading: boolean
  onSubmit: (req: PlanRequest) => void
}

const LOAD_PRESETS = [15_000, 30_000, 45_000, 60_000]
const MAX_LOAD = 80_000

function nextHalfHour(from: Date): Date {
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60)
  return d
}

// Pretty city part of an IANA name, e.g. America/Chicago -> Chicago.
const zoneCity = (tz: string) => tz.split('/').pop()?.replace(/_/g, ' ') ?? tz

export default function TripForm({ initialOrigin = null, initialDestination = null, loading, onSubmit }: Props) {
  const [origin, setOrigin] = useState<Place | null>(initialOrigin)
  const [destination, setDestination] = useState<Place | null>(initialDestination)
  // "Now" is refreshed every 30 s so the departure limits stay correct if the page stays open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Departure is wall-clock time in the origin's zone (the browser's zone until an origin is chosen).
  const [tz, setTz] = useState(browserZone)
  const [departureEdited, setDepartureEdited] = useState<string | null>(null)
  const [load, setLoad] = useState('32000')
  const [interval, setCheckpointInterval] = useState<10 | 25 | 50>(25)
  const [touched, setTouched] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  // Until the user picks a time, the default (next half hour) follows the trip's zone.
  const departure = departureEdited ?? toZonedInput(nextHalfHour(new Date(now)), tz)

  const limits = useMemo(
    () => ({ min: toZonedInput(new Date(now), tz), max: toZonedInput(new Date(now + 48 * 3600_000), tz) }),
    [now, tz],
  )

  useEffect(() => {
    if (!origin) return
    const controller = new AbortController()
    fetchTimezone(origin.lat, origin.lon, controller.signal)
      .then((res) => setTz(res.timezone))
      .catch(() => {
        /* keep the current zone; the plan still reports the real one */
      })
    return () => controller.abort()
  }, [origin])


  const loadNum = Number(load)
  const departureDate = zonedInputToDate(departure, tz)
  const errors = {
    origin: !origin ? 'Choose a starting point' : '',
    destination: !destination
      ? 'Choose a destination'
      : origin && origin.lat === destination.lat && origin.lon === destination.lon
        ? 'Destination must differ from the origin'
        : '',
    departure:
      Number.isNaN(departureDate.getTime())
        ? 'Pick a date and time'
        : departureDate.getTime() < now - 30 * 60_000
          ? 'Departure is in the past'
          : departureDate.getTime() > now + 48 * 3600_000
            ? 'Forecasts only cover the next 48 hours'
            : '',
    load:
      load.trim() === '' || !Number.isFinite(loadNum)
        ? 'Enter the load weight'
        : loadNum < 0 || loadNum > MAX_LOAD
          ? `Between 0 and ${MAX_LOAD.toLocaleString()} lb`
          : '',
  }
  const valid = Object.values(errors).every((e) => !e)
  const show = (msg: string) => (touched ? msg || undefined : undefined)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || !origin || !destination) return
    onSubmit({
      origin,
      destination,
      departure_time: departureDate.toISOString(),
      load_weight_lb: Math.round(loadNum),
      checkpoint_interval_miles: interval,
    })
  }

  // Starts the trip from where the driver is: GPS fix, then a readable place name.
  const locateMe = () => {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot share your location.')
      return
    }
    setLocating(true)
    setLocationError(null)
    try {
      navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          setOrigin(await reverseGeocode(latitude, longitude))
        } catch {
          setOrigin({ label: 'My location', lat: latitude, lon: longitude })
        }
        setLocating(false)
      },
      (err) => {
        setLocationError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Allow it in your browser, or type a starting point.' : 'Could not get your location. Type a starting point instead.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      )
    } catch {
      setLocationError('Location is blocked in this browser. Type a starting point instead.')
      setLocating(false)
    }
  }

  const loadHint =
    loadNum > 40_000
      ? 'Above 40,000 lb, wind of 35–44 mph is rated Severe.'
      : loadNum > 30_000
        ? 'Above 30,000 lb, wind of 45 mph or more means No Travel.'
        : 'Load rules start above 30,000 lb.'

  const quickDepartures = [
    { label: 'In 1 hour', value: toZonedInput(new Date(now + 3600_000), tz) },
    { label: 'In 3 hours', value: toZonedInput(new Date(now + 3 * 3600_000), tz) },
    { label: 'Tomorrow 6 AM', value: `${toZonedInput(new Date(now + 24 * 3600_000), tz).slice(0, 10)}T06:00` },
  ]

  const chip = (active: boolean) => ({
    flex: 1,
    py: 0.55,
    px: 1,
    fontSize: '0.74rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    borderRadius: '10px',
    border: '1px solid',
    borderColor: active ? ink.accent : ink.line,
    bgcolor: active ? 'rgba(242,183,5,0.12)' : 'transparent',
    color: active ? ink.accent : 'text.secondary',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'border-color 120ms, color 120ms, background-color 120ms',
    '&:hover': { borderColor: ink.lineStrong, color: 'text.primary' },
    '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: 2 },
  })

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Stack spacing={2.75}>
        <FormSection
          label="Route"
          action={
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                type="button"
                size="small"
                color="inherit"
                disabled={locating}
                startIcon={<MyLocationRoundedIcon fontSize="small" />}
                onClick={locateMe}
                sx={{ color: ink.accent, fontSize: '0.74rem', py: 0, minHeight: 24 }}
              >
                {locating ? 'Locating…' : 'Use my location'}
              </Button>
              <Button
              type="button"
              size="small"
              color="inherit"
              startIcon={<SwapVertRoundedIcon fontSize="small" />}
              onClick={() => {
                setOrigin(destination)
                setDestination(origin)
              }}
              sx={{ color: 'text.secondary', fontSize: '0.74rem', py: 0, minHeight: 24, '&:hover': { color: 'text.primary' } }}
            >
              Swap
            </Button>
            </Box>
          }
        >
          <Stack spacing={1.25}>
            <PlaceField label="Starting point" value={origin} onChange={setOrigin} icon={<TripOriginRoundedIcon fontSize="small" />} error={show(errors.origin)} />
            <PlaceField label="Destination" value={destination} onChange={setDestination} icon={<FlagRoundedIcon fontSize="small" />} error={show(errors.destination)} />
          </Stack>
          {locationError && (
            <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 1 }}>
              {locationError}
            </Typography>
          )}
        </FormSection>

        <FormSection label="Departure" action={<ZoneTag text={`${zoneAbbr(tz, Number.isNaN(departureDate.getTime()) ? new Date(now) : departureDate)} · ${origin ? zoneCity(tz) : 'your'} time`} />}>
          <TextField
            type="datetime-local"
            size="small"
            fullWidth
            value={departure}
            onChange={(e) => setDepartureEdited(e.target.value)}
            error={Boolean(show(errors.departure))}
            helperText={show(errors.departure)}
            slotProps={{ htmlInput: { min: limits.min, max: limits.max, 'aria-label': 'Departure date and time' } }}
          />
          <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
            {quickDepartures.map((q) => (
              <Box key={q.label} component="button" type="button" onClick={() => setDepartureEdited(q.value)} sx={chip(departure === q.value)}>
                {q.label}
              </Box>
            ))}
          </Stack>
        </FormSection>

        <FormSection
          label="Load weight"
          action={
            <Typography className="tnum" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {Number.isFinite(loadNum) ? loadNum.toLocaleString() : '–'} lb
            </Typography>
          }
        >
          <Slider
            value={Math.min(MAX_LOAD, Math.max(0, Number.isFinite(loadNum) ? loadNum : 0))}
            min={0}
            max={MAX_LOAD}
            step={500}
            onChange={(_, v) => setLoad(String(v))}
            aria-label="Load weight in pounds"
            sx={{ mx: 0.5, width: 'calc(100% - 8px)', py: 1.25 }}
          />
          <TextField
            type="number"
            size="small"
            fullWidth
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            error={Boolean(show(errors.load))}
            helperText={show(errors.load)}
            slotProps={{
              input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
              htmlInput: { min: 0, max: MAX_LOAD, step: 500, inputMode: 'numeric', 'aria-label': 'Load weight' },
            }}
          />
          <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
            {LOAD_PRESETS.map((p) => (
              <Box key={p} component="button" type="button" onClick={() => setLoad(String(p))} sx={chip(loadNum === p)}>
                {p / 1000}k
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {loadHint}
          </Typography>
        </FormSection>

        <FormSection label="Weather checkpoint every">
          <ToggleButtonGroup exclusive fullWidth size="small" value={interval} onChange={(_, v) => v && setCheckpointInterval(v)}>
            {[10, 25, 50].map((v) => (
              <ToggleButton key={v} value={v}>
                {v} miles
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </FormSection>

        <Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardRoundedIcon />}
            sx={{ py: 1.5, fontSize: '1rem' }}
          >
            {loading ? 'Checking routes and forecasts…' : 'Find the safest route'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
            Compares up to 3 routes using live forecast data
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}

function FormSection({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, minHeight: 24 }}>
        <Typography variant="h2" color="text.secondary">
          {label}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  )
}

function ZoneTag({ text }: { text: string }) {
  return (
    <Box sx={{ border: `1px solid ${ink.line}`, borderRadius: '8px', px: 1, py: 0.2, fontSize: '0.68rem', fontWeight: 600, color: 'text.secondary' }}>{text}</Box>
  )
}
