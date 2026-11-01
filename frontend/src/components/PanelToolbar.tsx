import { Box, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded'
import HorizontalSplitRoundedIcon from '@mui/icons-material/HorizontalSplitRounded'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { DISPLAY_FONT, ink } from '../theme'
import type { Dock, PanelSize } from '../lib/layout'

interface Props {
  dock: Dock
  size: PanelSize
  /** Narrow screens always dock the panel below the map. */
  canDockLeft: boolean
  onDock: (dock: Dock) => void
  onSize: (size: PanelSize) => void
  onHide: () => void
}

const iconBtn = {
  color: 'text.secondary',
  borderRadius: '10px',
  border: `1px solid ${ink.line}`,
  '&:hover': { color: 'text.primary', bgcolor: ink.raised },
  '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: 2 },
} as const

/** Where the panel lives and how big it is: left of the map, below it, wider, or out of the way. */
export default function PanelToolbar({ dock, size, canDockLeft, onDock, onSize, onHide }: Props) {
  const wide = size === 'wide'
  const grow = dock === 'left' ? (wide ? 'Make the panel narrower' : 'Make the panel wider') : wide ? 'Make the panel shorter' : 'Make the panel taller'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 2, borderBottom: `1px solid ${ink.line}`, flexShrink: 0 }}>
      <Typography sx={{ fontFamily: DISPLAY_FONT, fontSize: '1.45rem', lineHeight: 1, flex: 1, minWidth: 0 }} noWrap>
        Trip planner
      </Typography>

      <ToggleButtonGroup exclusive size="small" value={dock} onChange={(_, v: Dock | null) => v && onDock(v)} aria-label="Panel position">
        <Tooltip title={canDockLeft ? 'Dock to the left of the map' : 'Side-by-side needs a wider screen'}>
          <span>
            <ToggleButton value="left" disabled={!canDockLeft} aria-label="Dock panel to the left" sx={{ px: 1, borderRadius: '10px 0 0 10px' }}>
              <ViewSidebarRoundedIcon fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Tooltip title="Dock below the map">
          <ToggleButton value="bottom" aria-label="Dock panel below the map" sx={{ px: 1, borderRadius: '0 10px 10px 0' }}>
            <HorizontalSplitRoundedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>

      <Tooltip title={grow}>
        <IconButton size="small" aria-label={grow} onClick={() => onSize(wide ? 'comfort' : 'wide')} sx={iconBtn}>
          {wide ? <CloseFullscreenRoundedIcon fontSize="small" /> : <OpenInFullRoundedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Tooltip title="Hide the panel and use the full map">
        <IconButton size="small" aria-label="Hide the panel" onClick={onHide} sx={iconBtn}>
          <VisibilityOffOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
