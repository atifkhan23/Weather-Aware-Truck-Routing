import { Box } from '@mui/material'
import LogoMark from './LogoMark'

/** Compact two-line logo: shield emblem plus the name stacked beside it. */
export default function Logo({ tone = 'light', size = 34 }: { tone?: 'light' | 'dark'; size?: number }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.1 }}>
      <LogoMark size={size} />
      <Box component="span" sx={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.1, letterSpacing: '-0.02em', color: tone === 'light' ? '#0b1220' : '#e8eefc', textAlign: 'left' }}>
        Weather-Aware
        <br />
        Truck Routing
      </Box>
    </Box>
  )
}
