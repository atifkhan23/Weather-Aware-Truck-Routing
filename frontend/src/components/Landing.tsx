import { useEffect, useState } from 'react'
import { Box, Button, Container, Link, Stack, Typography } from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import TurnRightRoundedIcon from '@mui/icons-material/TurnRightRounded'
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded'
import ThunderstormOutlinedIcon from '@mui/icons-material/ThunderstormOutlined'
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined'
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded'
import WindChart from './WindChart'
import Logo from './Logo'
import { LEVELS, ROUTE_COLORS, levelColor } from '../lib/risk'
import { fetchConditions } from '../lib/api'
import type { Condition } from '../lib/types'
import { ink } from '../theme'
import type { Place } from '../lib/types'

interface Props {
  onStart: (origin: Place | null, destination: Place | null) => void
}

/** Below the hero the page is white and soft grey; only the hero is black and yellow. */
const light = {
  gray: '#f3f6fb',
  white: '#ffffff',
  ink: '#0b1220',
  text: '#0b1220',
  muted: '#4b5a73',
  line: '#e3e9f3',
  yellow: '#f5a300',
  yellowSoft: '#fff3cf',
  yellowLine: '#f0d77a',
}

/** One heading style for every section, the same bold sans as the hero. */
const head = (size: string | Record<string, string>, color?: string) => ({ fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, fontSize: size, color }) as const

/** White card with a soft shadow, no outline. */
const card = { bgcolor: '#ffffff', borderRadius: '22px', boxShadow: '0 10px 34px rgba(11,18,32,0.07)' } as const

const navLink = { color: ink.text, fontSize: '0.95rem', fontWeight: 600, px: 1.75, py: 0.8, borderRadius: 999, transition: 'background-color 140ms', '&:hover': { bgcolor: 'rgba(232,238,252,0.09)' } } as const

const pillSx = { display: 'inline-flex', alignItems: 'center', gap: 1.5, maxWidth: '100%', bgcolor: ink.panel, border: `1px solid ${ink.lineStrong}`, borderRadius: 999, pl: 2, pr: 2.5, py: { xs: 1, md: 1.25 }, mb: { xs: 3, md: 4 } } as const
const pillText = { fontSize: { xs: '0.88rem', md: '1rem' }, whiteSpace: 'nowrap' } as const



const RULES = [
  { name: 'Wind', unit: 'mph', note: 'sustained speed', cells: ['under 25', '25 – 34', '35 – 44', '45 – 54', '55 or more'] },
  { name: 'Rain', unit: 'in / hr', note: 'rain plus showers', cells: ['under 0.10', '0.10 – 0.25', '0.25 – 0.50', '0.50 – 1.00', 'over 1.00'] },
  { name: 'Snow', unit: 'in / hr', note: 'fresh snowfall', cells: ['under 0.5', '0.5 – 1.0', '1.0 – 2.0', '2.0 – 3.0', 'over 3.0'] },
]

/** A 48-hour strip with a weather front passing through, for the feature tile. */
const BARS = Array.from({ length: 48 }, (_, i) => {
  const peak = Math.exp(-((i - 27) ** 2) / 40)
  return { level: peak > 0.75 ? 2 : peak > 0.4 ? 1 : 0, height: 20 + peak * 44 + (i % 5) * 3 }
})

const chipSx = { display: 'inline-flex', alignItems: 'center', gap: 0.75, bgcolor: light.gray, border: `1px solid ${light.line}`, borderRadius: '10px', px: 1.25, py: 0.5, fontSize: '0.8rem', fontWeight: 600 } as const

function SectionHead({ eyebrowText, title, intro, align = 'center' }: { eyebrowText: string; title: string; intro?: string; align?: 'center' | 'left' }) {
  const center = align === 'center'
  return (
    <Box sx={{ textAlign: align, maxWidth: center ? 780 : 600, mx: center ? 'auto' : 0, mb: { xs: 5, md: center ? 7 : 0 } }}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, bgcolor: light.yellowSoft, color: '#6b4d00', borderRadius: 999, px: 1.75, py: 0.6, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: light.yellow }} />
        {eyebrowText}
      </Box>
      <Typography component="h2" sx={{ ...head({ xs: '2rem', md: '3rem' }, light.ink), mt: 2.5 }}>
        {title}
      </Typography>
      {intro && <Typography sx={{ color: light.muted, mt: 2, fontSize: '1.1rem', lineHeight: 1.65 }}>{intro}</Typography>}
    </Box>
  )
}

function Tile({ title, body, tone = 'white', children }: { title: string; body: string; tone?: 'white' | 'yellow'; children: React.ReactNode }) {
  const yellow = tone === 'yellow'
  return (
    <Box sx={{ ...card, bgcolor: yellow ? light.yellow : '#ffffff', p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 300 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.02em' }}>{title}</Typography>
      <Typography sx={{ color: yellow ? '#3d2c00' : light.muted, lineHeight: 1.6 }}>{body}</Typography>
      <Box sx={{ mt: 'auto', pt: 1 }}>{children}</Box>
    </Box>
  )
}

export default function Landing({ onStart }: Props) {
  // Real readings from our own API. While they load the pill is a neutral placeholder; if they fail it is hidden.
  const [conditions, setConditions] = useState<Condition[] | 'loading' | 'failed'>('loading')
  const [hub, setHub] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchConditions(controller.signal)
      .then((res) => setConditions(res.hubs))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setConditions('failed')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setHub((n) => n + 1), 3500)
    return () => window.clearInterval(id)
  }, [])
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const stepVisuals = [
    <Box key="1" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Box sx={chipSx}>Dallas</Box>
      <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: light.muted }} />
      <Box sx={chipSx}>Houston</Box>
      <Box sx={chipSx}>32,000 lb</Box>
    </Box>,
    <Box key="2" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {[
        ['a', 'A', '4 h 13'],
        ['c', 'C', '4 h 58'],
        ['b', 'B', '5 h 31'],
      ].map(([id, n, t]) => (
        <Box key={id} sx={chipSx}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: ROUTE_COLORS[id] === '#e8e4d8' ? '#a39a82' : ROUTE_COLORS[id] }} />
          Route {n} · {t}
        </Box>
      ))}
    </Box>,
    <Box key="3" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {['2:00 PM · 6 mph', '3:18 PM · 4 mph', '5:26 PM · 41 mph'].map((c, k) => (
        <Box key={c} sx={chipSx}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: LEVELS[k === 2 ? 2 : 0].color }} />
          {c}
        </Box>
      ))}
    </Box>,
    <Box key="4" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Box sx={{ ...chipSx, bgcolor: ink.bg, color: ink.accent, borderColor: ink.bg }}>
        <CheckRoundedIcon sx={{ fontSize: 15 }} />
        Recommended: Route A
      </Box>
      <Typography variant="caption" sx={{ color: light.muted }}>
        fewest Severe miles
      </Typography>
    </Box>,
  ]
  const STEPS = [
    { title: 'Tell us the trip', body: 'Where you start, where you are going, when you leave and how much the load weighs.' },
    { title: 'We find three routes', body: 'The fastest road plus genuinely different alternatives, each with distance and drive time.' },
    { title: 'Weather at the hour you arrive', body: 'Every 10, 25 or 50 miles we read the forecast for the hour the truck will actually be there.' },
    { title: 'Pick the safest', body: 'Routes are scored and ranked with a one-line reason, and you can scrub 48 hours of weather on the map.' },
  ]

  return (
    <Box sx={{ height: '100dvh', overflowY: 'auto', bgcolor: light.white, color: light.text }}>
      {/* Hero: full-bleed cover photo under a navy overlay, same palette as the planner */}
      <Box
        sx={{
          position: 'relative',
          bgcolor: ink.bg,
          color: '#ffffff',
          borderRadius: '0 0 32px 32px',
          overflow: 'hidden',
          minHeight: { xs: 'auto', md: 'min(100dvh, 860px)' },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* The wrapper is wider than the screen on desktop so the trucks sit right of the text */}
        <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%' }}>
          <Box
            component="img"
            src="/hero-sunset-1200.webp"
            srcSet="/hero-sunset-1200.webp 1200w, /hero-sunset.webp 2296w"
            sizes="100vw"
            width={2296}
            height={1524}
            alt=""
            fetchPriority="high"
            loading="eager"
            decoding="async"
            sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: { xs: '60% 72%', md: '50% 78%' }, filter: 'blur(3px)', transform: 'scale(1.04)' }}
          />
        </Box>
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            background: {
              xs: 'linear-gradient(180deg, rgba(11,18,32,0.78) 0%, rgba(11,18,32,0.7) 55%, rgba(11,18,32,0.9) 100%)',
              md: 'radial-gradient(ellipse 62% 70% at 50% 42%, rgba(11,18,32,0.82) 0%, rgba(11,18,32,0.6) 60%, rgba(11,18,32,0.12) 100%), linear-gradient(180deg, rgba(11,18,32,0.5) 0%, rgba(11,18,32,0) 22%, rgba(11,18,32,0) 78%, rgba(11,18,32,0.35) 100%)',
            },
          }}
        />

        <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1, height: { xs: 64, md: 76 }, display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: '1fr auto 1fr' }, alignItems: 'center', gap: { xs: 1.5, md: 3 } }}>
          <Box>
            <Logo tone="dark" size={32} />
          </Box>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', display: { xs: 'none', md: 'flex' } }}>
            <Link component="button" underline="none" onClick={() => scrollTo('how')} sx={navLink}>
              How it works
            </Link>
            <Link component="button" underline="none" onClick={() => scrollTo('rules')} sx={navLink}>
              Risk rules
            </Link>
          </Stack>
          <Button variant="contained" onClick={() => onStart(null, null)} sx={{ justifySelf: 'end', whiteSpace: 'nowrap', minWidth: { xs: 0, sm: 190 }, px: { xs: 2.5, sm: 4 }, py: 1.1 }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              Open planner
            </Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              Planner
            </Box>
          </Button>
        </Container>

        <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', pt: { xs: 4, md: 3 }, pb: { xs: 6, md: 8 } }}>
          <Box sx={{ maxWidth: 960, minWidth: 0, textAlign: 'center' }}>
            {conditions === 'loading' && (
              <Box sx={{ ...pillSx }} aria-live="polite">
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: ink.lineStrong, flexShrink: 0 }} />
                <Typography sx={{ ...pillText, color: ink.muted }}>Checking conditions…</Typography>
              </Box>
            )}
            {Array.isArray(conditions) && conditions.length > 0 && (
              <Box sx={{ ...pillSx }} aria-live="polite">
                <Box className="pulse-dot" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#4cae72', flexShrink: 0 }} />
                <Typography sx={{ ...pillText, fontWeight: 700 }}>Live now</Typography>
                <Box sx={{ width: '1px', height: 20, bgcolor: ink.lineStrong, flexShrink: 0 }} />
                <Typography className="tnum" noWrap sx={{ ...pillText, color: ink.muted, minWidth: 0 }}>
                  {conditions[hub % conditions.length].name}{' '}
                  <Box component="span" sx={{ color: levelColor(conditions[hub % conditions.length].level), fontWeight: 700 }}>
                    {Math.round(conditions[hub % conditions.length].wind_mph)} mph · {conditions[hub % conditions.length].label}
                  </Box>
                </Typography>
              </Box>
            )}

            <Typography
              component="h1"
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.035em',
                lineHeight: 1.06,
                overflowWrap: 'break-word',
                textShadow: '0 2px 24px rgba(0,0,0,0.35)',
                fontSize: { xs: 'clamp(1.75rem, 7.6vw, 2.9rem)', md: 'clamp(2.5rem, 4.8vw, 5rem)' },
              }}
            >
              The Safest Route.
              <br />
              Powered by{' '}
              <Box component="span" sx={{ color: ink.accent, position: 'relative', display: 'inline-block' }}>
                Weather.
              </Box>
            </Typography>

            <Typography sx={{ color: '#d5def2', fontSize: 'clamp(0.98rem, 3.8vw, 1.15rem)', lineHeight: 1.6, maxWidth: 700, mx: 'auto', mt: { xs: 4, md: 5 }, overflowWrap: 'break-word' }}>
              Plan your journey with real-time weather insights, smarter risk analysis, and safer routes for every trip.
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mt: 3.5, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
              <Button size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => onStart(null, null)} sx={{ px: 3.75, py: 1.5, fontSize: '1rem' }}>
                Plan Your Route
              </Button>
              <Button
                size="large"
                onClick={() => scrollTo('how')}
                startIcon={<PlayCircleOutlineRoundedIcon sx={{ fontSize: '26px !important' }} />}
                sx={{ color: '#ffffff', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}
              >
                See How It Works
              </Button>
            </Stack>

            <Box sx={{ mt: { xs: 4, md: 6 }, pt: 3, borderTop: '1px solid rgba(255,255,255,0.22)', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, auto)' }, justifyContent: 'center', gap: { xs: 2, sm: 0 }, textAlign: 'left' }}>
              {[
                { icon: <ThunderstormOutlinedIcon />, text: 'Real-Time Weather Risk' },
                { icon: <VerifiedUserOutlinedIcon />, text: 'Smart Route Ranking' },
                { icon: <BarChartRoundedIcon />, text: 'Safer Journeys, Lower Risks' },
              ].map((f, i) => (
                <Box key={f.text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: { sm: 3.5 }, pl: { sm: i ? 3.5 : 0 }, borderLeft: { sm: i ? '1px solid rgba(255,255,255,0.22)' : 'none' } }}>
                  <Box sx={{ display: 'flex', color: ink.accent, '& svg': { fontSize: 28 } }}>{f.icon}</Box>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, lineHeight: 1.3, maxWidth: 140 }}>{f.text}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>

      {/* How it works: four equal cards */}
      <Box id="how" sx={{ bgcolor: light.gray }}>
        <Container maxWidth="xl" sx={{ py: { xs: 8, md: 13 } }}>
          <SectionHead eyebrowText="How it works" title="Four steps from address to decision" intro="Give it a trip and it does the forecast maths for every checkpoint." />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
            {STEPS.map((s, i) => (
              <Box key={s.title} sx={{ ...card, p: { xs: 3, md: 3.5 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: light.yellow, color: light.ink, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '1.25rem', mb: 1 }}>{i + 1}</Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em', lineHeight: 1.25 }}>{s.title}</Typography>
                <Typography sx={{ color: light.muted, lineHeight: 1.6 }}>{s.body}</Typography>
                <Box sx={{ mt: 'auto', pt: 2 }}>{stepVisuals[i]}</Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Time-aware */}
      <Container maxWidth="xl" sx={{ py: { xs: 8, md: 13 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, gap: { xs: 5, md: 9 }, alignItems: 'center' }}>
        <Box>
          <SectionHead align="left" eyebrowText="Time-aware" title="The weather at departure is not the weather you drive through" />
          <Typography sx={{ color: light.muted, fontSize: '1.1rem', lineHeight: 1.7, mt: 3, maxWidth: 520 }}>
            A storm 300 miles away at 8 AM can be on top of you by 2 PM. Each checkpoint gets an arrival time from the route&apos;s drive time, and the forecast for that hour decides its risk.
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 3.5 }}>
            {['Forecast read for the hour you arrive, not the hour you leave', 'Heavier loads tighten the wind limits', 'Every time shown in the trip’s own time zone'].map((t) => (
              <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 24, height: 24, borderRadius: '8px', bgcolor: light.yellow, color: light.ink, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <CheckRoundedIcon sx={{ fontSize: 16 }} />
                </Box>
                <Typography sx={{ fontWeight: 600 }}>{t}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Box sx={{ ...card, p: { xs: 2.5, md: 4 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 2.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>Wind at each arrival time</Typography>
            <Typography variant="caption" sx={{ color: light.muted }}>
              leaving 8:00 AM · 45,000 lb
            </Typography>
          </Box>
          <WindChart />
        </Box>
      </Container>

      {/* What you get: equal tiles */}
      <Box sx={{ bgcolor: light.gray }}>
        <Container maxWidth="xl" sx={{ py: { xs: 8, md: 13 } }}>
          <SectionHead eyebrowText="What you get" title="Built for the decision, not the dashboard" />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
            <Tile title="Scrub 48 hours of weather" body="Drag the slider and watch the front move across your corridor, or tap a checkpoint to jump to the hour you will be there.">
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 84 }} aria-hidden>
                {BARS.map((b, i) => (
                  <Box key={i} sx={{ flex: 1, height: b.height, borderRadius: '3px', bgcolor: LEVELS[b.level].color }} />
                ))}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                {['Now', '+12 h', '+24 h', '+36 h', '+48 h'].map((l) => (
                  <Typography key={l} variant="caption" sx={{ color: light.muted }}>
                    {l}
                  </Typography>
                ))}
              </Box>
            </Tile>

            <Tile title="Turn-by-turn, with weather ahead" body="Start navigation to follow your live location, hear each turn, and get a warning before bad conditions on the road ahead.">
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 2, alignItems: 'center', bgcolor: light.gray, borderRadius: '16px', p: 2 }}>
                <Box sx={{ width: 52, height: 52, borderRadius: '14px', bgcolor: light.yellow, color: light.ink, display: 'grid', placeItems: 'center' }}>
                  <TurnRightRoundedIcon sx={{ fontSize: 32 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.02em' }}>0.5 mi</Typography>
                  <Typography sx={{ color: light.muted, fontSize: '0.9rem' }}>Turn right onto West Cermak Road</Typography>
                </Box>
              </Box>
            </Tile>

            <Tile title="Load-aware ratings" body="The same 41 mph wind is rated by what you are hauling.">
              <Box sx={{ display: 'grid', gap: 1.25 }}>
                {[
                  ['32,000 lb', 'High', 2],
                  ['45,000 lb', 'Severe', 3],
                ].map(([w, l, k]) => (
                  <Box key={w as string} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: light.gray, borderRadius: '14px', px: 2, py: 1.5 }}>
                    <Typography className="tnum" sx={{ fontWeight: 700 }}>
                      {w}
                    </Typography>
                    <Box sx={{ bgcolor: LEVELS[k as number].color, color: '#fff', borderRadius: '9px', px: 1.5, py: 0.4, fontSize: '0.8rem', fontWeight: 800 }}>{l}</Box>
                  </Box>
                ))}
              </Box>
            </Tile>

            <Tile tone="yellow" title="Plain-language reasons" body="Every recommendation says why it won, so you can trust it or overrule it.">
              <Typography sx={{ ...head({ xs: '1.5rem', md: '1.8rem' }, light.ink) }}>“Route A has the fewest Severe miles (0 vs 12 on Route C).”</Typography>
            </Tile>
          </Box>
        </Container>
      </Box>

      {/* Rules */}
      <Container id="rules" maxWidth="xl" sx={{ py: { xs: 8, md: 13 } }}>
        <SectionHead
          eyebrowText="Risk rules"
          title="Plain thresholds, no black box"
          intro="Wind, rain and snow are rated separately and the worst one sets the checkpoint's risk. Load weight can only make it worse."
        />
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          {RULES.map((r) => (
            <Box key={r.name} sx={{ ...card, p: { xs: 2.5, md: 3.5 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '190px 1fr' }, gap: { xs: 2, lg: 4 }, alignItems: 'center' }}>
              <Box>
                <Typography sx={{ ...head('1.9rem', light.ink) }}>{r.name}</Typography>
                <Typography variant="caption" sx={{ color: light.muted }}>
                  {r.unit} · {r.note}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }, gap: 1.25 }}>
                {LEVELS.map((l, i) => (
                  <Box key={l.key} sx={{ bgcolor: `${l.color}1f`, borderTop: `4px solid ${l.color}`, borderRadius: '14px', px: 1.75, py: 1.5 }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: light.ink }}>{l.label}</Typography>
                    <Typography className="tnum" sx={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em', mt: 0.5 }}>
                      {r.cells[i]}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5, mt: 3 }}>
          {[
            ['Wind 55 mph or more', 'No Travel at any weight'],
            ['Wind 45 – 54 mph with a load over 30,000 lb', 'No Travel'],
            ['Wind 35 – 44 mph with a load over 40,000 lb', 'Severe'],
          ].map(([a, b]) => (
            <Box key={a} sx={{ bgcolor: light.yellowSoft, borderRadius: '18px', p: 3 }}>
              <Typography sx={{ fontWeight: 700, lineHeight: 1.4 }}>{a}</Typography>
              <Typography sx={{ color: light.muted, mt: 0.75, fontWeight: 600 }}>→ {b}</Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* Closing call to action */}
      <Container maxWidth="xl" sx={{ pb: { xs: 6, md: 9 } }}>
        <Box sx={{ bgcolor: ink.bg, borderRadius: '28px', py: { xs: 6, md: 10 }, px: 3, textAlign: 'center' }}>
          <Typography component="h2" sx={{ ...head({ xs: '2rem', md: '3.4rem' }, '#ffffff'), maxWidth: 760, mx: 'auto' }}>
            Know the road before you roll.
          </Typography>
          <Typography sx={{ color: ink.muted, mt: 2, fontSize: '1.05rem' }}>Free, no account, and it takes under a minute.</Typography>
          <Button size="large" onClick={() => onStart(null, null)} endIcon={<ArrowForwardRoundedIcon />} variant="contained" sx={{ mt: 4, px: 4.5, py: 1.6 }}>
            Start planning
          </Button>
        </Box>
      </Container>

      {/* Footer */}
      <Box sx={{ borderTop: `1px solid ${light.line}` }}>
        <Container maxWidth="xl" sx={{ py: 4, display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo tone="light" size={30} />
          <Typography variant="caption" sx={{ color: light.muted, maxWidth: 620, lineHeight: 1.6 }}>
            Routing © OSRM / OpenStreetMap · Forecasts © Open-Meteo. Forecasts are guidance only; always follow official road and weather advisories.
          </Typography>
        </Container>
      </Box>
    </Box>
  )
}
