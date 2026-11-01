import { Box, Stack, Tooltip, Typography } from '@mui/material'
import { levelColor, levelLabel } from '../lib/risk'
import { fmtDayTime } from '../lib/format'
import type { Checkpoint, Route } from '../lib/types'

interface Props {
  route: Route
  tz: string
  onPick: (cp: Checkpoint) => void
}

function conditions(cp: Checkpoint): string {
  if (cp.wind_mph === undefined) return 'No forecast for this hour'
  const parts = [`${Math.round(cp.wind_mph)} mph wind`]
  if ((cp.rain_in_hr ?? 0) >= 0.01) parts.push(`${cp.rain_in_hr!.toFixed(2)}" rain/hr`)
  if ((cp.snow_in_hr ?? 0) >= 0.01) parts.push(`${cp.snow_in_hr!.toFixed(2)}" snow/hr`)
  return parts.join(' · ')
}

/** Vertical timeline of the selected route's checkpoints. */
export default function CheckpointList({ route, tz, onPick }: Props) {
  return (
    <Stack sx={{ position: 'relative' }}>
      {route.checkpoints.map((cp, i) => {
        const color = levelColor(cp.level)
        const last = i === route.checkpoints.length - 1
        return (
          <Tooltip key={cp.index} title="Fly to this checkpoint and show the forecast for its ETA" placement="right" enterDelay={600}>
            <Box
              component="button"
              type="button"
              onClick={() => onPick(cp)}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                gap: 1.25,
                alignItems: 'start',
                py: 0.75,
                px: 1,
                borderRadius: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: '#16213a' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
            >
              <Box sx={{ position: 'relative', height: '100%', display: 'flex', justifyContent: 'center' }}>
                {!last && (
                  <Box sx={{ position: 'absolute', top: 14, bottom: -14, width: 2, bgcolor: '#22304d' }} />
                )}
                <Box
                  sx={{
                    mt: 0.5,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: '2px solid #0b1220',
                    
                    zIndex: 1,
                  }}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {i === 0 ? 'Origin' : last ? 'Destination' : `Mile ${cp.mile}`}
                  <Typography component="span" variant="caption" color="text.secondary">
                    {' '}· {fmtDayTime(cp.eta, tz, true)}
                  </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {conditions(cp)}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color, fontWeight: 700, mt: 0.25 }}>
                {levelLabel(cp.level)}
              </Typography>
            </Box>
          </Tooltip>
        )
      })}
    </Stack>
  )
}
