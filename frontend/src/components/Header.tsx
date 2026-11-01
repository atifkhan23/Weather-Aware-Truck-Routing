import { Box, Button, ButtonBase, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import Logo from './Logo'
import { ink } from '../theme'
import type { MapStyle } from './MapView'

interface Props {
  mapStyle: MapStyle
  onMapStyle: (style: MapStyle) => void
  onReset: () => void
  onHome: () => void
}

export default function Header({ mapStyle, onMapStyle, onReset, onHome }: Props) {
  return (
    <Box
      component="header"
      sx={{
        bgcolor: ink.panel,
        borderBottom: `1px solid ${ink.line}`,
        px: { xs: 1.5, md: 2.5 },
        height: 60,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        zIndex: 3,
        position: 'relative',
      }}
    >
      <ButtonBase
        onClick={onHome}
        aria-label="Back to the home page"
        sx={{ gap: 1.25, minWidth: 0, textAlign: 'left', borderRadius: 1, '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: 3 } }}
      >
        <Logo tone="dark" size={30} />
      </ButtonBase>
      <Box sx={{ flex: 1 }} />

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <ToggleButtonGroup exclusive size="small" value={mapStyle} onChange={(_, v: MapStyle | null) => v && onMapStyle(v)} aria-label="Map style">
          <ToggleButton value="dark" aria-label="Dark map" sx={{ px: 1.1, gap: 0.5 }}>
            <DarkModeRoundedIcon fontSize="small" />
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: '0.78rem' }}>
              Dark
            </Box>
          </ToggleButton>
          <ToggleButton value="light" aria-label="Light map" sx={{ px: 1.1, gap: 0.5 }}>
            <LightModeRoundedIcon fontSize="small" />
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: '0.78rem' }}>
              Light
            </Box>
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="outlined"
          size="small"
          color="inherit"
          onClick={onReset}
          startIcon={<RestartAltRoundedIcon />}
          sx={{ borderColor: ink.line, color: 'text.secondary', '&:hover': { borderColor: ink.lineStrong, color: 'text.primary', bgcolor: ink.raised } }}
        >
          Reset
        </Button>
      </Stack>
    </Box>
  )
}
