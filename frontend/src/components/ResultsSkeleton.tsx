import { Box, Skeleton, Stack } from '@mui/material'
import { ink } from '../theme'

const card = { border: `1px solid ${ink.line}`, borderRadius: 1.5, bgcolor: ink.panel, p: 1.75 }

/** Placeholder for the recommendation and the three route cards while a plan loads. */
export default function ResultsSkeleton() {
  return (
    <Stack spacing={2.5} aria-busy="true" aria-label="Loading routes">
      <Box sx={{ ...card, p: 2 }}>
        <Skeleton width="30%" height={14} />
        <Skeleton width="55%" height={40} />
        <Skeleton sx={{ mt: 1 }} height={44} />
        <Skeleton width="80%" height={16} />
      </Box>
      <Stack spacing={1.25}>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={card}>
            <Skeleton width={110} height={22} sx={{ mb: 1 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 1.25, mb: 1.5 }}>
              <Skeleton height={34} />
              <Skeleton height={34} />
              <Skeleton height={34} />
            </Box>
            <Skeleton variant="rounded" height={8} />
          </Box>
        ))}
      </Stack>
    </Stack>
  )
}
