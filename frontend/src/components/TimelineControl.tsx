import { useEffect, useState } from 'react'
import { Box, Collapse, IconButton, LinearProgress, Slider, Stack, Switch, Tooltip, Typography } from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import { fmtDayTime, zoneAbbr } from '../lib/format'
import { panel } from '../theme'
import type { Heatmap } from '../lib/types'

interface Props {
  heatmap: Heatmap | null
  loading: boolean
  hour: number
  onHour: (h: number) => void
  playing: boolean
  onPlaying: (p: boolean) => void
  visible: boolean
  onVisible: (v: boolean) => void
  departure: string
  tz: string
  /** ETAs (ISO) of the selected route's checkpoints, drawn as ticks on the slider. */
  etas: string[]
}

const NOW_COLOR = '#ffffff'
const DEPARTURE_COLOR = '#f2b705'
const TICK_COLOR = '#93a3c3'

function Legend() {
  const item = (color: string, label: string, tall = true) => (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 2, height: tall ? 10 : 6, borderRadius: 1, bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  )
  return (
    <Stack direction="row" spacing={1.5} sx={{ display: { xs: 'none', md: 'flex' }, mt: 0.25 }}>
      {item(NOW_COLOR, 'Now')}
      {item(DEPARTURE_COLOR, 'Departure')}
      {item(TICK_COLOR, 'Checkpoint ETAs', false)}
    </Stack>
  )
}

export default function TimelineControl({
  heatmap,
  loading,
  hour,
  onHour,
  playing,
  onPlaying,
  visible,
  onVisible,
  departure,
  tz,
  etas,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const maxHour = (heatmap?.hours ?? 49) - 1

  useEffect(() => {
    if (!playing || !heatmap) return
    const id = window.setInterval(() => onHour((hour + 1) % (maxHour + 1)), 450)
    return () => window.clearInterval(id)
  }, [playing, heatmap, hour, maxHour, onHour])

  const startMs = heatmap ? new Date(heatmap.start).getTime() : 0
  const slotIso = heatmap ? new Date(startMs + hour * 3600_000).toISOString() : null
  const zone = slotIso ? zoneAbbr(tz, slotIso) : zoneAbbr(tz)
  const label = slotIso ? fmtDayTime(slotIso, tz) : 'Loading forecast…'

  const toPct = (ms: number) => {
    const h = (ms - startMs) / 3600_000
    return h >= 0 && h <= maxHour ? `${(h / maxHour) * 100}%` : null
  }
  const nowPct = heatmap ? toPct(now) : null
  const departurePct = heatmap ? toPct(new Date(departure).getTime()) : null
  const tickPcts = heatmap ? etas.map((e) => toPct(new Date(e).getTime())).filter((p): p is string => p !== null) : []

  const marks = [0, 12, 24, 36, 48].map((v) => ({ value: v, label: `${v}h` }))

  const line = (left: string, color: string, title: string, top = 3, height = 22) => (
    <Tooltip key={title} title={title}>
      <Box sx={{ position: 'absolute', left, top, width: 2, height, borderRadius: 1, bgcolor: color, transform: 'translateX(-1px)', zIndex: 1 }} />
    </Tooltip>
  )

  return (
    <Box
      sx={{
        ...panel,
        borderRadius: 1.5,
        px: { xs: 1.5, md: 2.25 },
        pt: { xs: 0.9, md: 1.5 },
        pb: { xs: 0.5, md: 1 },
        width: 'min(640px, calc(100vw - 24px))',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: { xs: 1, md: 1.5 } }}>
        <Tooltip title={playing ? 'Pause' : 'Play the forecast'}>
          <span>
            <IconButton
              size="small"
              disabled={!heatmap}
              onClick={() => onPlaying(!playing)}
              sx={{ bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }}
              aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
            >
              {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, lineHeight: 1.1 }}>
            Weather forecast · +{hour} h
          </Typography>
          <Typography className="tnum" noWrap sx={{ fontWeight: 700, fontSize: { xs: '0.82rem', md: '0.95rem' } }}>
            <Box component="span" sx={{ display: { xs: 'inline', md: 'none' }, color: 'text.secondary', fontWeight: 600 }}>
              +{hour}h ·{' '}
            </Box>
            {label} <span style={{ color: '#93a3c3', fontWeight: 600 }}>{zone}</span>
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={visible ? 'Hide heatmap' : 'Show heatmap'}>
          <Switch size="small" checked={visible} onChange={(e) => onVisible(e.target.checked)} slotProps={{ input: { 'aria-label': 'Show weather heatmap' } }} />
        </Tooltip>
        <IconButton
          size="small"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand forecast timeline' : 'Collapse forecast timeline'}
          aria-expanded={!collapsed}
          sx={{ color: 'text.secondary', transition: 'transform 200ms', transform: collapsed ? 'rotate(180deg)' : 'none' }}
        >
          <ExpandMoreRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Collapse in={!collapsed} unmountOnExit={false}>
        <Box sx={{ px: 1, position: 'relative', mt: 0.5 }}>
          {tickPcts.map((left, i) => (
            <Box
              key={`${left}-${i}`}
              aria-hidden
              sx={{ position: 'absolute', left, top: 9, width: '1px', height: 12, bgcolor: TICK_COLOR, transform: 'translateX(-0.5px)', pointerEvents: 'none' }}
            />
          ))}
          {nowPct && line(nowPct, NOW_COLOR, 'Now')}
          {departurePct && line(departurePct, DEPARTURE_COLOR, 'Your departure')}
          <Slider
            value={hour}
            min={0}
            max={maxHour}
            step={1}
            marks={marks}
            disabled={!heatmap}
            onChange={(_, v) => {
              onPlaying(false)
              onHour(v as number)
            }}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `+${v} h`}
            aria-label="Forecast hour"
            sx={{
              '& .MuiSlider-rail': { opacity: 1, bgcolor: '#22304d' },
              '& .MuiSlider-markLabel': { fontSize: '0.66rem', color: 'text.secondary' },
            }}
          />
        </Box>
        <Legend />
        {loading && <LinearProgress sx={{ borderRadius: 1, mt: 0.5, mb: 0.5, height: 2 }} />}
      </Collapse>
    </Box>
  )
}
