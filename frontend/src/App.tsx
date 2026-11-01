import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Collapse, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from '@mui/material'
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded'
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded'
import NavigationRoundedIcon from '@mui/icons-material/NavigationRounded'
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded'
import TripForm from './components/TripForm'
import RouteCard from './components/RouteCard'
import RecommendationHero from './components/RecommendationHero'
import ResultsSkeleton from './components/ResultsSkeleton'
import Header from './components/Header'
import PanelToolbar from './components/PanelToolbar'
import MapView, { MapLegend } from './components/MapView'
import type { FocusRequest, MapStyle } from './components/MapView'
import TimelineControl from './components/TimelineControl'
import CheckpointList from './components/CheckpointList'
import DirectionsList from './components/DirectionsList'
import NavBanner from './components/NavBanner'
import SafeBoundary from './components/SafeBoundary'
import { ApiError, fetchHeatmap, planTrip } from './lib/api'
import { describeStep, fmtAhead, stepStarts } from './lib/directions'
import { lineMiles, progressAlong } from './lib/geo'
import { loadLayout, saveLayout } from './lib/layout'
import { useNavigation } from './lib/useNavigation'
import type { Dock, PanelLayout, PanelSize } from './lib/layout'
import { ink, panel } from './theme'
import type { Checkpoint, Heatmap, Place, Plan, PlanRequest, Step } from './lib/types'

const WANTED_ROUTES = 3

type Tab = 'trip' | 'routes' | 'checkpoints' | 'directions'

function hourIndex(heatmap: Heatmap, iso: string): number {
  const h = Math.round((new Date(iso).getTime() - new Date(heatmap.start).getTime()) / 3600_000)
  return Math.max(0, Math.min(heatmap.hours - 1, h))
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2, border: `1px dashed ${ink.lineStrong}`, borderRadius: 3 }}>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, mx: 'auto' }}>
        {body}
      </Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  )
}

interface AppProps {
  initialOrigin: Place | null
  initialDestination: Place | null
  onHome: () => void
}

export default function App({ initialOrigin, initialDestination, onHome }: AppProps) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [heatmap, setHeatmap] = useState<Heatmap | null>(null)
  const [heatmapLoading, setHeatmapLoading] = useState(false)
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)

  const [mapStyle, setMapStyle] = useState<MapStyle>('dark')
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [resetNonce, setResetNonce] = useState(0)
  const [formKey, setFormKey] = useState(0)

  const [layout, setLayout] = useState<PanelLayout>(loadLayout)
  const [tab, setTab] = useState<Tab>('trip')
  const isWide = useMediaQuery('(min-width:900px)')

  // Live navigation: GPS follow, spoken turns and weather warnings along the selected route.
  const [navActive, setNavActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [following, setFollowing] = useState(true)
  const [target, setTarget] = useState<{ lat: number; lon: number; nonce: number } | null>(null)
  const { fix, error: gpsError } = useNavigation(navActive)
  const announced = useRef(-2)

  const inflight = useRef<AbortController | null>(null)
  const lastRequest = useRef<PlanRequest | null>(null)

  useEffect(() => saveLayout(layout), [layout])
  const update = (patch: Partial<PanelLayout>) => setLayout((l) => ({ ...l, ...patch }))

  // Narrow screens cannot sit side by side, so the panel goes under the map there.
  const dock: Dock = isWide ? layout.dock : 'bottom'
  const wide = layout.size === 'wide'
  const columns = dock === 'bottom' && isWide // three columns side by side, no tabs

  const handleSubmit = useCallback(async (req: PlanRequest) => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    lastRequest.current = req
    setLoading(true)
    setError(null)
    setPlaying(false)
    setHoveredId(null)
    setNavActive(false)
    setTab('routes')
    try {
      const result = await planTrip(req, controller.signal)
      setPlan(result)
      setSelectedId(result.recommended_id)
      setLoading(false)

      setHeatmapLoading(true)
      try {
        const hm = await fetchHeatmap(result.bounds, req.load_weight_lb, result.routes.map((r) => r.geometry), controller.signal)
        setHeatmap(hm)
        setHour(hourIndex(hm, result.inputs.departure))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setHeatmap(null)
          setError(`Routes are ready, but the heatmap could not load: ${(err as Error).message}`)
        }
      } finally {
        if (!controller.signal.aborted) setHeatmapLoading(false)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
      setTab('trip')
    }
  }, [])

  const reset = useCallback(() => {
    inflight.current?.abort()
    lastRequest.current = null
    setPlan(null)
    setSelectedId(null)
    setHoveredId(null)
    setHeatmap(null)
    setHeatmapLoading(false)
    setLoading(false)
    setError(null)
    setPlaying(false)
    setShowHeatmap(true)
    setFocus(null)
    setHour(0)
    setNavActive(false)
    setTab('trip')
    setFormKey((k) => k + 1)
    setResetNonce((n) => n + 1)
  }, [])

  const selected = plan?.routes.find((r) => r.id === selectedId) ?? null
  const recommended = plan?.routes.find((r) => r.id === plan.recommended_id) ?? null
  const routesByRank = plan ? [...plan.routes].sort((a, b) => a.rank - b.rank) : []
  const tz = plan?.inputs.timezone ?? 'UTC'

  const pickCheckpoint = useCallback(
    (cp: Checkpoint) => {
      if (selected) setFocus({ routeId: selected.id, index: cp.index, nonce: Date.now() })
      if (heatmap) {
        setPlaying(false)
        setShowHeatmap(true)
        setHour(hourIndex(heatmap, cp.eta))
      }
    },
    [heatmap, selected],
  )

  const geometryMiles = useMemo(() => (selected ? lineMiles(selected.geometry) : 0), [selected])

  // Where the driver is along the selected route, what comes next and what the weather does ahead.
  const nav = useMemo(() => {
    if (!selected || !fix || selected.steps.length === 0) return null
    const progress = progressAlong(selected.geometry, [fix.lat, fix.lon])
    const scale = geometryMiles > 0 ? selected.distance_miles / geometryMiles : 1
    const miles = Math.min(selected.distance_miles, progress.miles * scale)
    const steps = selected.steps
    const starts = stepStarts(steps)
    let index = -1
    for (let i = 0; i < steps.length; i++) if (starts[i] <= miles + 0.02) index = i
    const next = steps[index + 1] ?? null
    const remaining = Math.max(0, selected.distance_miles - miles)
    const risky = selected.checkpoints.find((c) => c.mile > miles && (c.level === 'high' || c.level === 'severe' || c.level === 'no_travel'))
    const road = steps[index]
    return {
      index,
      next,
      distToNext: next ? Math.max(0, starts[index + 1] - miles) : 0,
      remaining,
      remainingSeconds: selected.duration_seconds * (remaining / Math.max(selected.distance_miles, 0.1)),
      offRoute: progress.offRouteMiles > 0.3,
      arrived: remaining < 0.1,
      weather: risky ? { level: risky.level, miles: risky.mile - miles, label: risky.reasons[0] ?? '' } : null,
      road: road ? road.name || road.ref : '',
    }
  }, [selected, fix, geometryMiles])

  const speak = useCallback((text: string) => {
    try {
      if (!('speechSynthesis' in window)) return
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
    } catch {
      /* voice is optional */
    }
  }, [])

  // Announce each turn once, when it is about half a mile away.
  useEffect(() => {
    if (!navActive || muted || !nav?.next) return
    if (nav.distToNext <= 0.5 && announced.current !== nav.index) {
      announced.current = nav.index
      speak('In ' + fmtAhead(nav.distToNext) + ', ' + describeStep(nav.next))
    }
  }, [navActive, muted, nav, speak])

  const startNav = useCallback(() => {
    announced.current = -2
    setFollowing(true)
    setNavActive(true)
    setTab('directions')
  }, [])

  const stopNav = useCallback(() => {
    setNavActive(false)
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    } catch {
      /* voice is optional */
    }
  }, [])

  const reroute = useCallback(() => {
    const last = lastRequest.current
    if (!fix || !last) return
    handleSubmit({ ...last, origin: { label: 'My location', lat: fix.lat, lon: fix.lon }, departure_time: new Date().toISOString() })
  }, [fix, handleSubmit])

  const pickStep = useCallback((s: Step) => {
    setFollowing(false)
    setTarget({ lat: s.lat, lon: s.lon, nonce: Date.now() })
  }, [])

  const fewRoutes = plan !== null && plan.routes.length < WANTED_ROUTES

  const tripContent = (
    <Stack spacing={2.5}>
      <TripForm key={formKey} initialOrigin={initialOrigin} initialDestination={initialDestination} loading={loading} onSubmit={handleSubmit} />
      <Collapse in={Boolean(error)} unmountOnExit>
        <Alert severity="error" variant="outlined" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Collapse>
    </Stack>
  )

  const routesContent = loading ? (
    <ResultsSkeleton />
  ) : plan && recommended ? (
    <Stack spacing={3} key={plan.inputs.departure + plan.recommended_id + plan.routes.length}>
      <RecommendationHero plan={plan} route={recommended} />
      {selected && selected.steps.length > 0 && (
        <Button variant="contained" size="large" fullWidth startIcon={<NavigationRoundedIcon />} onClick={startNav} sx={{ py: 1.4 }}>
          Start navigation · Route {selected.name}
        </Button>
      )}
      <Box>
        <Typography variant="h2" color="text.secondary" sx={{ mb: 1.5 }}>
          Route options ({plan.routes.length})
        </Typography>
        {fewRoutes && (
          <Alert
            severity="warning"
            icon={<AltRouteRoundedIcon fontSize="small" />}
            sx={{ mb: 1.5, alignItems: 'center' }}
            action={
              <Button color="inherit" size="small" onClick={() => lastRequest.current && handleSubmit(lastRequest.current)}>
                Retry
              </Button>
            }
          >
            {plan.route_notice ?? 'Only ' + plan.routes.length + ' of ' + WANTED_ROUTES + ' route options were found for this trip.'} Try a nearby start or end point to compare more roads, or retry if the routing service was busy.
          </Alert>
        )}
        <Stack spacing={1.5}>
          {routesByRank.map((route, i) => (
            <RouteCard
              key={route.id}
              index={i + 1}
              route={route}
              baseline={recommended}
              recommended={route.id === plan.recommended_id}
              selected={route.id === selectedId}
              tz={tz}
              onSelect={() => setSelectedId(route.id)}
              onHover={(h) => setHoveredId(h ? route.id : null)}
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Ranked by fewest Severe miles, then fewest High miles, then lowest average risk, then shortest travel time. Times are shown in the trip&apos;s local time zone.
        </Typography>
      </Box>
    </Stack>
  ) : (
    <Empty
      title="No routes yet"
      body="Plan a trip and your route options will appear here, ranked by weather risk."
      action={
        !columns && (
          <Button size="small" variant="outlined" color="inherit" onClick={() => setTab('trip')}>
            Plan a trip
          </Button>
        )
      }
    />
  )

  const checkpointsContent =
    selected && !loading ? (
      <Box>
        <Typography variant="h2" color="text.secondary" sx={{ mb: 1.5 }}>
          Route {selected.name} checkpoints
        </Typography>
        <CheckpointList route={selected} tz={tz} onPick={pickCheckpoint} />
      </Box>
    ) : (
      <Empty title="No checkpoints yet" body="Each route is checked every few miles. Pick a route to see the forecast at every stop." />
    )

  const directionsContent =
    selected && plan ? (
      <SafeBoundary label="Directions" key={selected.id + selected.steps.length}>
        <DirectionsList route={selected} navigating={navActive} currentIndex={nav?.index ?? -1} onStart={startNav} onStop={stopNav} onPick={pickStep} />
      </SafeBoundary>
    ) : (
      <Empty title="No directions yet" body="Plan a trip and the turn-by-turn directions for the selected route will appear here." />
    )

  const credit = (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', opacity: 0.75, mt: 4 }}>
      Routing © OSRM / OpenStreetMap · Forecasts © Open-Meteo. Forecasts are guidance only; always follow official road and weather advisories.
    </Typography>
  )

  const leftWidth = wide ? 600 : 440
  const bottomHeight = wide ? 'clamp(360px, 58%, 620px)' : 'clamp(300px, 44%, 480px)'
  const narrowBottom = wide ? '64%' : '50%'

  const gridColumns = layout.hidden ? 'minmax(0, 1fr)' : dock === 'left' ? `${leftWidth}px minmax(0, 1fr)` : 'minmax(0, 1fr)'
  const gridRows = layout.hidden ? 'minmax(0, 1fr)' : dock === 'left' ? 'minmax(0, 1fr)' : `minmax(0, 1fr) ${isWide ? bottomHeight : narrowBottom}`

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Header mapStyle={mapStyle} onMapStyle={setMapStyle} onReset={reset} onHome={onHome} />
      {(plan?.simulation ?? heatmap?.simulation) && (
        <Box role="status" sx={{ bgcolor: '#e0a43a', color: '#17130a', px: 2, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexShrink: 0, textAlign: 'center' }}>
          <ScienceRoundedIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem' }}>
            {(plan?.simulation ?? heatmap?.simulation)?.label}
            <Box component="span" sx={{ fontWeight: 500, display: { xs: 'none', sm: 'inline' } }}>
              {' · '}
              {(plan?.simulation ?? heatmap?.simulation)?.detail}
            </Box>
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: gridColumns,
          gridTemplateRows: gridRows,
          transition: 'grid-template-columns 260ms ease, grid-template-rows 260ms ease',
        }}
      >
        {/* Panel (kept mounted when hidden so the form keeps what was typed) */}
        <Box
          component="aside"
          aria-label="Trip planner panel"
          sx={{
            display: layout.hidden ? 'none' : 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            order: dock === 'left' ? 1 : 2,
            bgcolor: ink.bg,
            borderRight: dock === 'left' ? `1px solid ${ink.line}` : 'none',
            borderTop: dock === 'bottom' ? `1px solid ${ink.line}` : 'none',
            zIndex: 2,
          }}
        >
          <PanelToolbar
            dock={layout.dock}
            size={layout.size}
            canDockLeft={isWide}
            onDock={(d) => update({ dock: d })}
            onSize={(s: PanelSize) => update({ size: s })}
            onHide={() => update({ hidden: true })}
          />

          {columns ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.05fr 1fr 0.9fr' }}>
              {[
                tripContent,
                routesContent,
                <Stack key="side" spacing={2}>
                  <ToggleButtonGroup exclusive size="small" fullWidth value={tab === 'directions' ? 'directions' : 'checkpoints'} onChange={(_, v: Tab | null) => v && setTab(v)} aria-label="Right-hand section">
                    <ToggleButton value="checkpoints">Checkpoints</ToggleButton>
                    <ToggleButton value="directions" disabled={!plan}>
                      Directions
                    </ToggleButton>
                  </ToggleButtonGroup>
                  {tab === 'directions' ? directionsContent : checkpointsContent}
                </Stack>,
              ].map((content, i) => (
                <Box key={i} sx={{ overflowY: 'auto', p: 3, borderRight: i < 2 ? `1px solid ${ink.line}` : 'none' }}>
                  {content}
                  {i === 2 && credit}
                </Box>
              ))}
            </Box>
          ) : (
            <>
              <Tabs
                value={tab}
                onChange={(_, v: Tab) => setTab(v)}
                variant="fullWidth"
                aria-label="Planner sections"
                sx={{
                  px: 3,
                  flexShrink: 0,
                  minHeight: 46,
                  borderBottom: `1px solid ${ink.line}`,
                  '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.84rem', minHeight: 46, minWidth: 0, px: 0.5, color: 'text.secondary' },
                  '& .Mui-selected': { color: `${ink.text} !important` },
                  '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0', bgcolor: ink.accent },
                }}
              >
                <Tab value="trip" label="Trip" />
                <Tab value="routes" label={plan ? `Routes (${plan.routes.length})` : 'Routes'} />
                <Tab value="checkpoints" label="Checkpoints" disabled={!plan} />
                <Tab value="directions" label="Directions" disabled={!plan} />
              </Tabs>
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 3 }}>
                {tab === 'trip' && tripContent}
                {tab === 'routes' && routesContent}
                {tab === 'checkpoints' && checkpointsContent}
                {tab === 'directions' && directionsContent}
                {credit}
              </Box>
            </>
          )}
        </Box>

        {/* Map */}
        <Box component="main" className={mapStyle === 'light' ? 'map-light' : undefined} sx={{ order: dock === 'left' ? 2 : 1, position: 'relative', minHeight: 0, minWidth: 0 }}>
          <MapView
            plan={plan}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            heatmap={heatmap}
            hour={hour}
            showHeatmap={showHeatmap}
            mapStyle={mapStyle}
            focus={focus}
            resetNonce={resetNonce}
            driver={fix}
            follow={navActive && following}
            onUserPan={() => setFollowing(false)}
            target={target}
          />
          <MapLegend />

          {navActive && selected && (
            <SafeBoundary label="Navigation" floating>
            <NavBanner
              fix={fix}
              error={gpsError}
              next={nav?.next ?? null}
              distToNext={nav?.distToNext ?? 0}
              currentRoad={nav?.road ?? ''}
              remainingMiles={nav?.remaining ?? selected.distance_miles}
              remainingSeconds={nav?.remainingSeconds ?? selected.duration_seconds}
              arrived={nav?.arrived ?? false}
              offRoute={nav?.offRoute ?? false}
              weather={nav?.weather ?? null}
              tz={tz}
              arriveAt={(fix?.at ?? 0) + (nav?.remainingSeconds ?? selected.duration_seconds) * 1000}
              following={following}
              muted={muted}
              onRecenter={() => setFollowing(true)}
              onMute={() => setMuted((m) => !m)}
              onReroute={reroute}
              onEnd={stopNav}
            />
            </SafeBoundary>
          )}

          {layout.hidden && (
            <Button
              variant="contained"
              size="small"
              startIcon={<ViewSidebarRoundedIcon />}
              onClick={() => update({ hidden: false })}
              sx={{ position: 'absolute', left: 12, top: 56, zIndex: 1000, px: 2 }}
            >
              Show panel
            </Button>
          )}

          {!plan && !loading && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 500, p: 2 }}>
              <Box className="rise" sx={{ ...panel, textAlign: 'center', px: 3, py: 2.5, maxWidth: 360, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Plan a trip to compare routes</Typography>
                <Typography variant="body2" color="text.secondary">
                  Enter where you are going, when you leave and how heavy the load is. Each route is checked against the forecast for the hour you will reach every checkpoint.
                </Typography>
              </Box>
            </Box>
          )}

          {plan && (
            <Box sx={{ position: 'absolute', left: '50%', bottom: { xs: 8, md: 24 }, transform: 'translateX(-50%)', zIndex: 1000 }}>
              <TimelineControl
                heatmap={heatmap}
                loading={heatmapLoading}
                hour={hour}
                onHour={setHour}
                playing={playing}
                onPlaying={setPlaying}
                visible={showHeatmap}
                onVisible={setShowHeatmap}
                departure={plan.inputs.departure}
                tz={tz}
                etas={selected?.checkpoints.map((c) => c.eta) ?? []}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
