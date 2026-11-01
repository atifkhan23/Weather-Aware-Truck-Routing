import { Box, Typography } from '@mui/material'
import { LEVELS } from '../lib/risk'

/** Wind the truck meets at each checkpoint's arrival time on a sample 45,000 lb trip leaving at 8:00 AM. */
const DATA = [
  { t: '8:00', mph: 6 },
  { t: '9:05', mph: 9 },
  { t: '10:25', mph: 18 },
  { t: '11:30', mph: 25 },
  { t: '12:35', mph: 31 },
  { t: '1:40', mph: 41 },
  { t: '2:45', mph: 36 },
  { t: '3:30', mph: 28 },
  { t: '4:10', mph: 22 },
]

const W = 620
const H = 300
const M = { l: 44, r: 12, t: 28, b: 38 }
const MAX = 50
const SEVERE_AT = 35 // for loads over 40,000 lb

const INK = '#111111'
const MUTED = '#4b5563'
const GRID = '#e6eaf0'

/** Moderate from 25 mph, Severe from 35 mph at this weight (see the load rules). */
const levelFor = (mph: number) => (mph >= SEVERE_AT ? 3 : mph >= 25 ? 1 : 0)

export default function WindChart() {
  const pw = W - M.l - M.r
  const ph = H - M.t - M.b
  const y = (mph: number) => M.t + ph * (1 - mph / MAX)
  const slot = pw / DATA.length
  const barW = Math.min(40, slot * 0.62)
  const peak = DATA.reduce((a, b) => (b.mph > a.mph ? b : a))
  const peakIndex = DATA.indexOf(peak)
  const peakX = M.l + slot * (peakIndex + 0.5)

  return (
    <Box>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Bar chart of wind speed at each checkpoint's arrival time. Wind stays below 10 mph at departure and reaches 41 mph at 1:40 PM, above the 35 mph Severe line for a 45,000 pound load."
        sx={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {[0, 10, 20, 30, 40, 50].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={M.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED} fontFamily="Inter, sans-serif">
              {v}
            </text>
          </g>
        ))}
        <text x={M.l - 10} y={M.t - 12} textAnchor="end" fontSize="11" fill={MUTED} fontFamily="Inter, sans-serif">
          mph
        </text>

        {/* Severe line for loads over 40,000 lb */}
        <line x1={M.l} x2={W - M.r} y1={y(SEVERE_AT)} y2={y(SEVERE_AT)} stroke={LEVELS[3].color} strokeWidth="1.5" strokeDasharray="5 5" />
        <text x={W - M.r} y={y(SEVERE_AT) - 7} textAnchor="end" fontSize="11" fontWeight="600" fill={LEVELS[3].color} fontFamily="Inter, sans-serif">
          Severe at 45,000 lb
        </text>

        {DATA.map((d, i) => {
          const cx = M.l + slot * (i + 0.5)
          return (
            <g key={d.t}>
              <rect x={cx - barW / 2} y={y(d.mph)} width={barW} height={y(0) - y(d.mph)} rx="6" fill={LEVELS[levelFor(d.mph)].color} />
              <text x={cx} y={H - 16} textAnchor="middle" fontSize="11" fill={MUTED} fontFamily="Inter, sans-serif">
                {d.t}
              </text>
            </g>
          )
        })}

        {/* Departure reading */}
        <text x={M.l + slot * 0.5} y={y(DATA[0].mph) - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK} fontFamily="Inter, sans-serif">
          6
        </text>

        {/* Peak callout */}
        <g transform={`translate(${Math.min(peakX - 62, W - M.r - 124)} ${M.t - 22})`}>
          <rect width="124" height="22" rx="6" fill={INK} />
          <text x="62" y="15" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#ffffff" fontFamily="Inter, sans-serif">
            {peak.t} PM · {peak.mph} mph
          </text>
        </g>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5 }}>
        {[0, 1, 3].map((k) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: LEVELS[k].color }} />
            <Typography variant="caption" sx={{ color: MUTED }}>
              {LEVELS[k].label}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 2.5, pt: 2.5, borderTop: '1px solid #dbe1e9', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Forecast at 8:00 AM</Typography>
          <Typography sx={{ fontWeight: 800, letterSpacing: '-0.03em', fontSize: '1.7rem', lineHeight: 1.15, color: INK }}>6 mph · Low</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>What you actually meet</Typography>
          <Typography sx={{ fontWeight: 800, letterSpacing: '-0.03em', fontSize: '1.7rem', lineHeight: 1.15, color: LEVELS[3].color }}>41 mph · Severe</Typography>
        </Box>
      </Box>
    </Box>
  )
}
