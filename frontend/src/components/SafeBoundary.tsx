import { Component } from 'react'
import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import { ink } from '../theme'

interface Props {
  children: ReactNode
  /** What this part is called, for the message and the console. */
  label: string
  /** Render nothing instead of a message (for map overlays). */
  silent?: boolean
  /** Place the message on top of the map instead of in the flow. */
  floating?: boolean
}

/**
 * Keeps an optional feature (directions, GPS, voice, location marker) from taking the planner down:
 * if it throws while rendering, only this part is replaced by a short note and the rest keeps working.
 */
export default class SafeBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[' + this.props.label + '] turned off after an error:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.silent) return null
    return (
      <Box
        role="status"
        sx={{
          p: 2,
          borderRadius: 3,
          border: '1px dashed ' + ink.lineStrong,
          bgcolor: ink.panel,
          ...(this.props.floating ? { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: 420 } : {}),
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {this.props.label} is unavailable right now.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          The planner, map and forecast keep working.
        </Typography>
      </Box>
    )
  }
}
