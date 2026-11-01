import { Box, Button, Stack, Typography } from '@mui/material'
import NavigationRoundedIcon from '@mui/icons-material/NavigationRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import StepGlyph from './StepGlyph'
import { describeStep, glyphFor } from '../lib/directions'
import { fmtDuration, fmtMiles } from '../lib/format'
import { ink } from '../theme'
import type { Route, Step } from '../lib/types'

interface Props {
  route: Route
  navigating: boolean
  /** Index of the step whose road the driver is on (-1 before the first fix). */
  currentIndex: number
  onStart: () => void
  onStop: () => void
  onPick: (step: Step) => void
}

/** Turn-by-turn directions for the selected route. Tap a step to see where it happens on the map. */
export default function DirectionsList({ route, navigating, currentIndex, onStart, onStop, onPick }: Props) {
  const steps = route.steps

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h2" color="text.secondary">
            Route {route.name} directions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {steps.length > 0 ? `${steps.length} steps · ${fmtMiles(route.distance_miles)} · ${fmtDuration(route.duration_seconds)}` : 'No step-by-step directions for this route'}
          </Typography>
        </Box>
        {navigating ? (
          <Button size="small" variant="outlined" color="inherit" startIcon={<StopRoundedIcon />} onClick={onStop} sx={{ borderColor: ink.lineStrong }}>
            End
          </Button>
        ) : (
          <Button size="small" variant="contained" startIcon={<NavigationRoundedIcon />} onClick={onStart} disabled={steps.length === 0}>
            Start
          </Button>
        )}
      </Box>

      {!navigating && steps.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Start follows your live location on the map, announces the next turn, and warns you about bad weather ahead. Your browser will ask to share your location.
        </Typography>
      )}

      <Stack spacing={0.5}>
        {steps.map((s, i) => {
          const active = navigating && i === currentIndex + 1
          const done = navigating && i <= currentIndex
          return (
            <Box
              key={i}
              component="button"
              type="button"
              onClick={() => onPick(s)}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: '36px 1fr auto',
                gap: 1.5,
                alignItems: 'center',
                p: 1.25,
                borderRadius: 2.5,
                cursor: 'pointer',
                bgcolor: active ? 'rgba(242,183,5,0.12)' : 'transparent',
                border: `1px solid ${active ? ink.accent : 'transparent'}`,
                opacity: done ? 0.45 : 1,
                '&:hover': { bgcolor: active ? 'rgba(242,183,5,0.16)' : ink.raised },
                '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: 2 },
              }}
            >
              <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: ink.raised, color: active ? ink.accent : ink.text }}>
                <StepGlyph glyph={glyphFor(s)} size={22} />
              </Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: active ? 700 : 500, lineHeight: 1.35 }}>{describeStep(s)}</Typography>
              {s.distance_miles > 0 && (
                <Typography className="tnum" variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {fmtMiles(s.distance_miles)}
                </Typography>
              )}
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
