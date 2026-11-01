import { Box, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import RiskStrip from './RiskStrip'
import { ROUTE_COLORS, levelColor, levelLabel } from '../lib/risk'
import { fmtDayTime, fmtDelta, fmtDuration, fmtMiles } from '../lib/format'
import { DISPLAY_FONT, ink } from '../theme'
import type { Route } from '../lib/types'

interface Props {
  route: Route
  /** The recommended route, used as the baseline for "+42 min" style comparisons. */
  baseline: Route
  recommended: boolean
  selected: boolean
  tz: string
  index: number
  onSelect: () => void
  onHover: (hovered: boolean) => void
}

function Stat({ label, value, big, color }: { label: string; value: string; big?: boolean; color?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography
        className="tnum"
        sx={{
          fontFamily: big ? DISPLAY_FONT : undefined, fontWeight: big ? 400 : 600,
          fontSize: big ? '1.5rem' : '0.88rem',
          color,
          whiteSpace: 'nowrap',
          lineHeight: big ? 1.1 : 1.4,
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

const tag = { height: 22, borderRadius: 999, fontWeight: 600, fontSize: '0.7rem', bgcolor: 'transparent' } as const

/** "+42 min" on slower routes, "−12 min" on faster ones, relative to the recommended route. */
function TimeDelta({ route, baseline }: { route: Route; baseline: Route }) {
  const diff = Math.round((route.duration_seconds - baseline.duration_seconds) / 60) * 60
  const color = diff === 0 ? ink.muted : diff < 0 ? '#4cae72' : '#e0a43a'
  return (
    <Chip
      size="small"
      label={diff === 0 ? 'Same time' : `${fmtDelta(diff)} vs recommended`}
      sx={{ ...tag, color, border: `1px solid ${alpha(color, 0.6)}` }}
    />
  )
}

export default function RouteCard({ route, baseline, recommended, selected, tz, index, onSelect, onHover }: Props) {
  const color = ROUTE_COLORS[route.id] ?? ink.text
  const s = route.summary
  const distDiff = route.distance_miles - baseline.distance_miles

  return (
    <Box
      component="button"
      type="button"
      className="rise"
      style={{ ['--i' as string]: index }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={selected}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        position: 'relative',
        width: '100%',
        cursor: 'pointer',
        p: 1.75,
        borderRadius: 1.5,
        border: `1px solid ${selected ? ink.lineStrong : ink.line}`,
        borderLeft: `4px solid ${color}`,
        bgcolor: selected ? ink.raised : ink.panel,
        transition: 'background-color 140ms, border-color 140ms',
        '&:hover': { bgcolor: ink.raised, borderColor: ink.lineStrong },
        '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: 2 },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.25 }}>
        <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 400, fontSize: '1.4rem', lineHeight: 1 }}>
          Route {route.name}
        </Typography>
        {route.source === 'fastest' && <Chip label="Fastest" size="small" variant="outlined" sx={{ ...tag, color: 'text.secondary', borderColor: ink.lineStrong, height: 20 }} />}
        <Box sx={{ flex: 1 }} />
        {recommended ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.9,
              py: 0.25,
              borderRadius: 0.75,
              bgcolor: '#4cae72',
              color: '#08140d',
              fontSize: '0.64rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <CheckRoundedIcon sx={{ fontSize: 13 }} />
            Recommended
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Rank {route.rank}
          </Typography>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 1.25, mb: 1.25, alignItems: 'end' }}>
        <Stat label="Drive time" value={fmtDuration(route.duration_seconds)} big />
        <Stat label="Distance" value={fmtMiles(route.distance_miles)} big />
        <Stat label="Arrive" value={fmtDayTime(route.arrival, tz)} />
      </Box>

      {route.id !== baseline.id && (
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>
          <TimeDelta route={route} baseline={baseline} />
          {Math.abs(distDiff) >= 1 && (
            <Chip size="small" label={`${distDiff > 0 ? '+' : '−'}${fmtMiles(Math.abs(distDiff))}`} sx={{ ...tag, color: 'text.secondary', border: `1px solid ${ink.lineStrong}` }} />
          )}
        </Stack>
      )}

      <RiskStrip route={route} tz={tz} />
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>Origin</Typography>
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>Destination</Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25, mt: 1, pt: 1, borderTop: `1px solid ${ink.line}` }}>
        <Stat label="Severe" value={fmtMiles(s.severe_miles)} color={s.severe_miles > 0 ? levelColor('severe') : undefined} />
        <Stat label="High" value={fmtMiles(s.high_miles)} color={s.high_miles > 0 ? levelColor('high') : undefined} />
        <Stat label="Avg risk" value={`${s.average_risk.toFixed(2)} / 4`} />
      </Box>

      {(s.no_travel_miles > 0 || s.unknown_miles > 0) && (
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>
          {s.no_travel_miles > 0 && (
            <Chip size="small" label={`${fmtMiles(s.no_travel_miles)} No Travel`} sx={{ ...tag, color: levelColor('no_travel'), border: `1px solid ${levelColor('no_travel')}` }} />
          )}
          {s.unknown_miles > 0 && <Chip size="small" label={`${fmtMiles(s.unknown_miles)} beyond forecast`} sx={{ ...tag, color: 'text.secondary', border: `1px solid ${ink.lineStrong}` }} />}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Worst conditions: <b style={{ color: levelColor(s.max_level) }}>{levelLabel(s.max_level)}</b>
      </Typography>
    </Box>
  )
}
