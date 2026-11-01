import { Fragment, useEffect, useMemo, useRef } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { Box, IconButton, Stack, Typography } from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded'
import AirRoundedIcon from '@mui/icons-material/AirRounded'
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded'
import AcUnitRoundedIcon from '@mui/icons-material/AcUnitRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded'
import L from 'leaflet'
import type { CircleMarker as LeafletCircleMarker, LatLngBoundsExpression, Polyline as LeafletPolyline } from 'leaflet'
import HeatmapOverlay from './HeatmapOverlay'
import SafeBoundary from './SafeBoundary'
import { LEVELS, ROUTE_COLORS, levelColor, levelLabel } from '../lib/risk'
import { fmtDayTime, fmtMiles } from '../lib/format'
import { ink, panel } from '../theme'
import type { DriverFix } from '../lib/useNavigation'
import type { Checkpoint, Heatmap, Plan, Route } from '../lib/types'

export type MapStyle = 'dark' | 'light'

export interface FocusRequest {
  routeId: string
  index: number
  nonce: number
}

interface Props {
  plan: Plan | null
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  heatmap: Heatmap | null
  hour: number
  showHeatmap: boolean
  mapStyle: MapStyle
  focus: FocusRequest | null
  resetNonce: number
  /** The driver's live position while navigating. */
  driver: DriverFix | null
  follow: boolean
  onUserPan: () => void
  /** Fly here (used when a direction step is tapped). */
  target: { lat: number; lon: number; nonce: number } | null
}

const HOME_CENTER: [number, number] = [39.5, -98.35]
const HOME_ZOOM = 4

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function pinIcon(fill: string, glyphColor: string, kind: 'origin' | 'destination') {
  const glyph =
    kind === 'origin'
      ? `<circle cx="17" cy="15.5" r="5" fill="${glyphColor}"/>`
      : `<path d="M12.5 9.5v13M12.5 10h10l-2.6 3.4 2.6 3.4h-10" fill="${glyphColor}" stroke="${glyphColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
  return L.divIcon({
    className: '',
    iconSize: [34, 42],
    iconAnchor: [17, 41],
    tooltipAnchor: [0, -38],
    html:
      '<div class="map-pin"><svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">' +
      `<path d="M17 41S31 26 31 15.5C31 7.5 24.8 1.5 17 1.5S3 7.5 3 15.5C3 26 17 41 17 41Z" fill="${fill}" stroke="#0b1220" stroke-width="2"/>` +
      `${glyph}</svg></div>`,
  })
}

const ORIGIN_ICON = pinIcon('#e8eefc', '#0b1220', 'origin')
const DESTINATION_ICON = pinIcon('#f2b705', '#17130a', 'destination')

function FitToPlan({ plan }: { plan: Plan | null }) {
  const map = useMap()
  useEffect(() => {
    if (!plan) return
    const { south, west, north, east } = plan.bounds
    const bounds: LatLngBoundsExpression = [
      [south, west],
      [north, east],
    ]
    map.flyToBounds(bounds, { padding: [60, 60], duration: 0.9, maxZoom: 10 })
  }, [plan, map])
  return null
}

/** The panel can dock left, dock below or hide, so the map re-measures whenever its box changes. */
function KeepSized() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }))
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [map])
  return null
}

/** Keeps the driver centred while following; dragging the map hands control back to the user. */
function FollowDriver({ driver, follow, onUserPan }: { driver: DriverFix | null; follow: boolean; onUserPan: () => void }) {
  const map = useMap()
  useMapEvents({ dragstart: onUserPan })
  useEffect(() => {
    if (driver && follow && Number.isFinite(driver.lat) && Number.isFinite(driver.lon)) map.setView([driver.lat, driver.lon], Math.max(map.getZoom(), 14), { animate: true })
  }, [driver, follow, map])
  return null
}

function FlyToTarget({ target }: { target: { lat: number; lon: number; nonce: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target && Number.isFinite(target.lat) && Number.isFinite(target.lon)) map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 13), { duration: 0.7 })
  }, [target, map])
  return null
}

function ResetView({ nonce }: { nonce: number }) {
  const map = useMap()
  useEffect(() => {
    if (nonce > 0) map.flyTo(HOME_CENTER, HOME_ZOOM, { duration: 0.8 })
  }, [nonce, map])
  return null
}

type MarkerRefs = Record<string, LeafletCircleMarker | null>

/** Flies to a checkpoint picked in the sidebar and opens its popup. */
function FocusCheckpoint({ focus, markers }: { focus: FocusRequest | null; markers: React.RefObject<MarkerRefs> }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    const marker = markers.current[`${focus.routeId}-${focus.index}`]
    if (!marker) return
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 9), { duration: 0.8 })
    const timer = window.setTimeout(() => marker.openPopup(), 850)
    return () => window.clearTimeout(timer)
  }, [focus, map, markers])
  return null
}

function ZoomControls({ plan }: { plan: Plan | null }) {
  const map = useMap()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    L.DomEvent.disableClickPropagation(ref.current)
    L.DomEvent.disableScrollPropagation(ref.current)
  }, [])

  const fit = () => {
    if (plan) {
      const { south, west, north, east } = plan.bounds
      map.flyToBounds(
        [
          [south, west],
          [north, east],
        ],
        { padding: [60, 60], duration: 0.7, maxZoom: 10 },
      )
    } else {
      map.flyTo(HOME_CENTER, HOME_ZOOM, { duration: 0.7 })
    }
  }

  return (
    <Stack
      ref={ref}
      sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, borderRadius: 1.5, overflow: 'hidden', ...panel }}
    >
      {[
        { label: 'Zoom in', icon: <AddRoundedIcon fontSize="small" />, run: () => map.zoomIn() },
        { label: 'Zoom out', icon: <RemoveRoundedIcon fontSize="small" />, run: () => map.zoomOut() },
        { label: plan ? 'Fit all routes' : 'Reset map view', icon: <FitScreenRoundedIcon fontSize="small" />, run: fit },
      ].map((b, i) => (
        <IconButton
          key={b.label}
          aria-label={b.label}
          title={b.label}
          onClick={b.run}
          sx={{
            borderRadius: 0,
            color: 'text.primary',
            p: 1,
            borderTop: i ? `1px solid ${ink.line}` : 'none',
            '&:hover': { bgcolor: ink.raised },
            '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: -2 },
          }}
        >
          {b.icon}
        </IconButton>
      ))}
    </Stack>
  )
}

/** Small risk-colour legend that sits on the map. */
export function MapLegend() {
  return (
    <Stack
      direction="row"
      aria-label="Risk legend"
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 1000,
        px: 1.25,
        py: 0.75,
        borderRadius: 1.5,
        gap: { xs: 0.9, sm: 1.25 },
        alignItems: 'center',
        pointerEvents: 'none',
        ...panel,
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>
        Risk
      </Typography>
      {LEVELS.map((l) => (
        <Stack key={l.key} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: l.color }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>
            {l.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

function PopupRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
      <Box sx={{ display: 'flex', color: ink.muted }}>{icon}</Box>
      <span style={{ color: ink.muted }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontWeight: 600 }} className="tnum">
        {value}
      </span>
    </Box>
  )
}

function CheckpointPopup({ route, cp, tz }: { route: Route; cp: Checkpoint; tz: string }) {
  const color = levelColor(cp.level)
  const iconSx = { fontSize: 16 }
  return (
    <Box sx={{ minWidth: 220 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{levelLabel(cp.level)} risk</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Route {route.name} · mile {cp.mile}
        </Typography>
      </Box>
      <PopupRow icon={<ScheduleRoundedIcon sx={iconSx} />} label="ETA" value={fmtDayTime(cp.eta, tz, true)} />
      {cp.wind_mph !== undefined && (
        <>
          <PopupRow icon={<AirRoundedIcon sx={iconSx} />} label="Wind" value={`${cp.wind_mph} mph · gusts ${cp.gust_mph}`} />
          <PopupRow icon={<WaterDropRoundedIcon sx={iconSx} />} label="Rain" value={`${cp.rain_in_hr?.toFixed(2)} in/hr`} />
          <PopupRow icon={<AcUnitRoundedIcon sx={iconSx} />} label="Snow" value={`${cp.snow_in_hr?.toFixed(2)} in/hr`} />
        </>
      )}
      <PopupRow icon={<StraightenRoundedIcon sx={iconSx} />} label="Covers" value={fmtMiles(cp.covered_miles)} />
      {cp.reasons.length > 0 && (
        <Typography variant="caption" sx={{ color, display: 'block', mt: 0.75, pt: 0.75, borderTop: `1px solid ${ink.line}` }}>
          {cp.reasons.join(' · ')}
        </Typography>
      )}
    </Box>
  )
}

interface PathProps {
  route: Route
  color: string
  weight: number
  opacity: number
  dashArray?: string
  animate: boolean
  renderer: L.Renderer
  onClick: () => void
  tooltip: string
}

/** A route line that, when ``animate`` is set, draws itself from origin to destination. */
function RoutePath({ route, color, weight, opacity, dashArray, animate, renderer, onClick, tooltip }: PathProps) {
  const ref = useRef<LeafletPolyline>(null)
  useEffect(() => {
    const el = ref.current?.getElement() as SVGPathElement | undefined
    if (!animate || !el || prefersReducedMotion()) return
    const len = el.getTotalLength()
    el.style.setProperty('--len', String(len))
    el.style.strokeDasharray = String(len)
    el.style.animation = 'draw-route 1100ms cubic-bezier(0.4, 0, 0.2, 1) both'
    // Leaflet re-projects the path on zoom, so drop the length-based dash once the draw ends.
    const done = () => {
      el.style.animation = ''
      el.style.strokeDasharray = ''
    }
    el.addEventListener('animationend', done, { once: true })
    return () => el.removeEventListener('animationend', done)
  }, [animate])

  const pathOptions = useMemo(
    () => ({ color, weight, opacity, dashArray, lineCap: 'round' as const, renderer }),
    [color, weight, opacity, dashArray, renderer],
  )
  return (
    <Polyline ref={ref} positions={route.geometry} pathOptions={pathOptions} eventHandlers={{ click: onClick }}>
      <Tooltip sticky>{tooltip}</Tooltip>
    </Polyline>
  )
}

interface RoutesProps {
  plan: Plan
  ordered: Route[]
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
}

function RouteLayers({ plan, ordered, selectedId, hoveredId, onSelect }: RoutesProps) {
  // SVG (not canvas) so CSS can animate the line drawing and the glow.
  const renderer = useMemo(() => L.svg({ pane: 'routes', padding: 0.4 }), [])
  const planKey = `${plan.inputs.departure}-${plan.recommended_id}-${plan.routes[0]?.distance_miles}`

  return (
    <>
      {ordered.map((route) => {
        const selected = route.id === selectedId
        const hovered = route.id === hoveredId
        const recommended = route.id === plan.recommended_id
        const color = ROUTE_COLORS[route.id] ?? '#5b8cff'
        const strong = selected || hovered
        return (
          <Fragment key={route.id}>
            {strong && (
              <Polyline positions={route.geometry} pathOptions={{ color: ink.bg, weight: 9, opacity: 0.9, renderer }} interactive={false} />
            )}
            <RoutePath
              key={`${planKey}:${route.id}:${selected}`}
              route={route}
              color={color}
              weight={strong ? 5 : 4}
              opacity={strong ? 1 : 0.45}
              dashArray={strong ? undefined : '6 8'}
              animate={selected}
              renderer={renderer}
              onClick={() => onSelect(route.id)}
              tooltip={`Route ${route.name}${recommended ? ' · Recommended' : ''}`}
            />
          </Fragment>
        )
      })}
    </>
  )
}

export default function MapView({
  plan,
  selectedId,
  hoveredId,
  onSelect,
  heatmap,
  hour,
  showHeatmap,
  mapStyle,
  focus,
  resetNonce,
  driver,
  follow,
  onUserPan,
  target,
}: Props) {
  const markers = useRef<MarkerRefs>({})

  // Draw the selected route last so it sits on top.
  const ordered = useMemo(() => {
    if (!plan) return []
    return [...plan.routes].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
  }, [plan, selectedId])

  const tz = plan?.inputs.timezone ?? 'UTC'
  const start = plan?.routes[0]?.geometry[0]
  const endGeom = plan?.routes[0]?.geometry
  const end = endGeom?.[endGeom.length - 1]

  return (
    <MapContainer
      center={HOME_CENTER}
      zoom={HOME_ZOOM}
      minZoom={3}
      preferCanvas
      zoomControl={false}
      worldCopyJump
      className={mapStyle === 'light' ? 'map-light' : undefined}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        key={mapStyle}
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Weather: <a href="https://open-meteo.com/">Open-Meteo</a>'
        className={mapStyle === 'dark' ? 'osm-dark-tiles' : undefined}
        maxZoom={19}
      />
      <FitToPlan plan={plan} />
      <ResetView nonce={resetNonce} />
      <KeepSized />
      <SafeBoundary label="Live location" silent>
        <FollowDriver driver={driver} follow={follow} onUserPan={onUserPan} />
        <FlyToTarget target={target} />
      </SafeBoundary>
      <FocusCheckpoint focus={focus} markers={markers} />
      <ZoomControls plan={plan} />

      {heatmap && showHeatmap && <HeatmapOverlay heatmap={heatmap} hour={hour} opacity={0.85} />}

      <Pane name="routes" style={{ zIndex: 410 }}>
        {plan && <RouteLayers plan={plan} ordered={ordered} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} />}
      </Pane>

      <Pane name="checkpoints" style={{ zIndex: 420 }}>
        {ordered.map((route) => {
          const selected = route.id === selectedId
          return route.checkpoints.map((cp) => (
            <CircleMarker
              key={`${route.id}-${cp.index}`}
              ref={(m) => {
                markers.current[`${route.id}-${cp.index}`] = m
                return () => {
                  markers.current[`${route.id}-${cp.index}`] = null
                }
              }}
              center={[cp.lat, cp.lon]}
              radius={selected ? (cp.level === 'severe' || cp.level === 'no_travel' ? 9 : 7) : 4.5}
              pathOptions={{
                color: cp.level === 'severe' || cp.level === 'no_travel' ? ink.text : ink.bg,
                weight: selected ? 2 : 1,
                fillColor: levelColor(cp.level),
                fillOpacity: selected ? 1 : 0.7,
              }}
              eventHandlers={{ click: () => onSelect(route.id) }}
            >
              <Popup>
                <CheckpointPopup route={route} cp={cp} tz={tz} />
              </Popup>
            </CircleMarker>
          ))
        })}
      </Pane>

      <Pane name="driver" style={{ zIndex: 440 }}>
        <SafeBoundary label="Location marker" silent>
        {driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lon) && (
          <>
            <Circle center={[driver.lat, driver.lon]} radius={Math.min(driver.accuracyMeters, 400)} pathOptions={{ color: '#4d8dff', weight: 1, fillColor: '#4d8dff', fillOpacity: 0.12 }} interactive={false} />
            <CircleMarker center={[driver.lat, driver.lon]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#4d8dff', fillOpacity: 1 }}>
              <Tooltip direction="top">You are here</Tooltip>
            </CircleMarker>
          </>
        )}
        </SafeBoundary>
      </Pane>

      <Pane name="endpoints" style={{ zIndex: 430 }}>
        {start && (
          <Marker position={start} icon={ORIGIN_ICON} keyboard={false}>
            <Tooltip direction="top">Origin</Tooltip>
          </Marker>
        )}
        {end && (
          <Marker position={end} icon={DESTINATION_ICON} keyboard={false}>
            <Tooltip direction="top">Destination</Tooltip>
          </Marker>
        )}
      </Pane>
    </MapContainer>
  )
}
