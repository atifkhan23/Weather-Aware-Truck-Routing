import { Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded'
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import StepGlyph from './StepGlyph'
import { describeStep, fmtAhead, glyphFor } from '../lib/directions'
import { fmtDuration, fmtMiles, fmtTime } from '../lib/format'
import { levelColor, levelLabel } from '../lib/risk'
import { ink, panel } from '../theme'
import type { DriverFix } from '../lib/useNavigation'
import type { LevelKey, Step } from '../lib/types'

export interface WeatherAhead {
  level: LevelKey
  miles: number
  label: string
}

interface Props {
  fix: DriverFix | null
  error: string | null
  next: Step | null
  distToNext: number
  currentRoad: string
  remainingMiles: number
  remainingSeconds: number
  arrived: boolean
  offRoute: boolean
  weather: WeatherAhead | null
  tz: string
  /** Estimated arrival (ms since 1970). */
  arriveAt: number
  following: boolean
  muted: boolean
  onRecenter: () => void
  onMute: () => void
  onReroute: () => void
  onEnd: () => void
}

/** The driver's heads-up display: next turn, what is left, and weather coming up. */
export default function NavBanner({ fix, error, next, distToNext, currentRoad, remainingMiles, remainingSeconds, arrived, offRoute, weather, tz, arriveAt, following, muted, onRecenter, onMute, onReroute, onEnd }: Props) {
  const eta = new Date(arriveAt).toISOString()

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ ...panel, position: 'absolute', top: { xs: 56, md: 12 }, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, width: 'min(520px, calc(100% - 24px))', borderRadius: 3, overflow: 'hidden', boxShadow: '0 14px 34px rgba(0,0,0,0.4)' }}
    >
      {error ? (
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {error}
          </Typography>
          <Button size="small" variant="outlined" color="inherit" onClick={onEnd}>
            Close
          </Button>
        </Box>
      ) : !fix ? (
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <CircularProgress size={20} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            Finding your location…
          </Typography>
          <Button size="small" variant="outlined" color="inherit" onClick={onEnd}>
            Cancel
          </Button>
        </Box>
      ) : arrived ? (
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <StepGlyph glyph="arrive" size={32} />
          <Typography sx={{ flex: 1, fontWeight: 700 }}>You have arrived</Typography>
          <Button size="small" variant="contained" onClick={onEnd}>
            Done
          </Button>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 1.75, alignItems: 'center', p: 1.75 }}>
            <Box sx={{ width: 56, height: 56, borderRadius: 2.5, bgcolor: ink.accent, color: ink.accentInk, display: 'grid', placeItems: 'center' }}>
              <StepGlyph glyph={next ? glyphFor(next) : 'straight'} size={34} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography className="tnum" sx={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {next ? fmtAhead(distToNext) : '—'}
              </Typography>
              <Typography sx={{ fontSize: '0.92rem', lineHeight: 1.3 }}>{next ? describeStep(next) : 'Continue to your destination'}</Typography>
              {currentRoad && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  On {currentRoad}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5}>
              {!following && (
                <Tooltip title="Re-centre on me">
                  <IconButton size="small" aria-label="Re-centre the map on my location" onClick={onRecenter} sx={{ color: ink.accent }}>
                    <MyLocationRoundedIcon />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={muted ? 'Turn voice on' : 'Mute voice'}>
                <IconButton size="small" aria-label={muted ? 'Turn voice guidance on' : 'Mute voice guidance'} onClick={onMute} sx={{ color: 'text.secondary' }}>
                  {muted ? <VolumeOffRoundedIcon /> : <VolumeUpRoundedIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="End navigation">
                <IconButton size="small" aria-label="End navigation" onClick={onEnd} sx={{ color: 'text.secondary' }}>
                  <CloseRoundedIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {offRoute && (
            <Box sx={{ px: 1.75, py: 1, bgcolor: 'rgba(229,89,79,0.14)', borderTop: `1px solid ${ink.line}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                You are off the planned route.
              </Typography>
              <Button size="small" variant="contained" onClick={onReroute}>
                Re-plan from here
              </Button>
            </Box>
          )}

          {weather && (
            <Box sx={{ px: 1.75, py: 1, bgcolor: `${levelColor(weather.level)}22`, borderTop: `1px solid ${ink.line}`, display: 'flex', alignItems: 'center', gap: 1 }}>
              <WarningAmberRoundedIcon sx={{ fontSize: 18, color: levelColor(weather.level) }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {levelLabel(weather.level)} conditions in {fmtMiles(weather.miles)} <span style={{ fontWeight: 400, opacity: 0.8 }}>· {weather.label}</span>
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 3, px: 1.75, py: 1.1, borderTop: `1px solid ${ink.line}`, bgcolor: ink.bg }}>
            {[
              ['Left', fmtMiles(remainingMiles)],
              ['Time', fmtDuration(remainingSeconds)],
              ['Arrive', fmtTime(eta, tz)],
            ].map(([k, v]) => (
              <Box key={k}>
                <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{k}</Typography>
                <Typography className="tnum" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                  {v}
                </Typography>
              </Box>
            ))}
            {fix.speedMph != null && (
              <Box sx={{ ml: 'auto' }}>
                <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>Speed</Typography>
                <Typography className="tnum" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                  {Math.round(fix.speedMph)} mph
                </Typography>
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
