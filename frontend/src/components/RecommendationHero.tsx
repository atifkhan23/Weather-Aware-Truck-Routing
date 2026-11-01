import { Alert, Box, Typography } from '@mui/material'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { ROUTE_COLORS, levelColor, levelLabel } from '../lib/risk'
import { fmtDuration, fmtMiles } from '../lib/format'
import { DISPLAY_FONT, ink } from '../theme'
import type { Plan, Route } from '../lib/types'

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
      <Typography className="tnum" sx={{ fontFamily: DISPLAY_FONT, fontSize: '1.3rem', fontWeight: 400, lineHeight: 1.15, whiteSpace: 'nowrap', color }}>
        {value}
      </Typography>
    </Box>
  )
}

/** The verdict: which route to take, with the numbers that matter and why it won. */
export default function RecommendationHero({ plan, route }: { plan: Plan; route: Route }) {
  const color = ROUTE_COLORS[route.id] ?? ink.text
  const worst = route.summary.max_level
  return (
    <Box className="rise" sx={{ border: `1px solid ${ink.lineStrong}`, borderLeft: `4px solid ${color}`, borderRadius: 1.5, bgcolor: ink.panel, p: 2 }}>
      <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' }}>
        Recommended route
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontFamily: DISPLAY_FONT, fontSize: '2.4rem', fontWeight: 400, lineHeight: 1 }}>
          Route {route.name}
        </Typography>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, alignSelf: 'center' }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, py: 1.25, borderTop: `1px solid ${ink.line}`, borderBottom: `1px solid ${ink.line}` }}>
        <Figure label="Drive time" value={fmtDuration(route.duration_seconds)} />
        <Figure label="Distance" value={fmtMiles(route.distance_miles)} />
        <Figure label="Worst risk" value={levelLabel(worst)} color={levelColor(worst)} />
      </Box>

      <Typography variant="body2" sx={{ mt: 1.25 }}>
        {plan.recommendation.reason}
      </Typography>
      {plan.recommendation.warning && (
        <Alert icon={<WarningAmberRoundedIcon fontSize="small" />} severity="warning" variant="outlined" sx={{ mt: 1.25, py: 0 }}>
          {plan.recommendation.warning}
        </Alert>
      )}
    </Box>
  )
}
