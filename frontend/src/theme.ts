import { createTheme } from '@mui/material/styles'

/** Flat, print-like palette: warm charcoal surfaces, hairline rules and one road-sign amber accent. */
export const ink = {
  bg: '#0b1220',
  panel: '#111a2e',
  raised: '#16213a',
  line: '#22304d',
  lineStrong: '#324566',
  text: '#e8eefc',
  muted: '#93a3c3',
  accent: '#f2b705',
  accentInk: '#17130a',
}

export const DISPLAY_FONT = '"DM Serif Display", Georgia, serif'

/** Plain bordered surface shared by sidebar blocks, map controls and the timeline. */
export const panel = {
  bgcolor: ink.panel,
  border: `1px solid ${ink.line}`,
} as const

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: ink.accent, contrastText: ink.accentInk },
    secondary: { main: '#3fae6a' },
    background: { default: ink.bg, paper: ink.panel },
    text: { primary: ink.text, secondary: ink.muted },
    divider: ink.line,
    error: { main: '#e5594f' },
    warning: { main: '#e0a43a' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontFamily: DISPLAY_FONT, fontSize: '1.3rem', fontWeight: 400, letterSpacing: '0', lineHeight: 1.15 },
    h2: { fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' },
    body2: { fontSize: '0.84rem' },
    caption: { fontSize: '0.72rem', lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: ink.bg,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: ink.line },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ink.lineStrong },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ink.accent, borderWidth: 1 },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999 },
        contained: { '&:hover': { backgroundColor: '#ffc61f' } },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: ink.line,
          color: ink.muted,
          '&.Mui-selected': { color: ink.accent, backgroundColor: 'rgba(242, 183, 5, 0.1)', borderColor: ink.accent },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(242, 183, 5, 0.16)' },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: ink.raised, border: `1px solid ${ink.lineStrong}`, fontSize: '0.75rem', color: ink.text } },
    },
    MuiSlider: {
      styleOverrides: {
        thumb: { boxShadow: 'none', '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 6px rgba(242,183,5,0.16)' } },
      },
    },
  },
})
