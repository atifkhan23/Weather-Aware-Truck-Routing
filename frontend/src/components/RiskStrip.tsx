import { Box, Tooltip } from '@mui/material'
import { levelColor, levelLabel } from '../lib/risk'
import { fmtDayTime, fmtMiles } from '../lib/format'
import type { Route } from '../lib/types'

/** Risk level along the route in driving order: one coloured segment per checkpoint. */
export default function RiskStrip({ route, tz, height = 10 }: { route: Route; tz: string; height?: number }) {
  const total = route.checkpoints.reduce((sum, cp) => sum + cp.covered_miles, 0) || 1
  return (
    <Box
      role="img"
      aria-label={`Risk along route ${route.name}, origin to destination: ${route.checkpoints.map((c) => levelLabel(c.level)).join(', ')}`}
      sx={{ display: 'flex', height, borderRadius: 0.5, overflow: 'hidden', gap: '2px', bgcolor: '#16213a' }}
    >
      {route.checkpoints.map((cp) => (
        <Tooltip
          key={cp.index}
          arrow
          title={`Mile ${cp.mile} · ${fmtDayTime(cp.eta, tz)} · ${levelLabel(cp.level)} (${fmtMiles(cp.covered_miles)})`}
        >
          <Box sx={{ flex: `${cp.covered_miles / total} 1 0`, minWidth: 2, bgcolor: levelColor(cp.level), opacity: 0.92 }} />
        </Tooltip>
      ))}
    </Box>
  )
}
