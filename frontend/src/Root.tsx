import { useCallback, useEffect, useState } from 'react'
import App from './App'
import Landing from './components/Landing'
import type { Place } from './lib/types'

const PLAN_HASH = '#/plan'

/** Landing page at "/", planner at "/#/plan". */
export default function Root() {
  const [view, setView] = useState<'landing' | 'plan'>(() => (window.location.hash === PLAN_HASH ? 'plan' : 'landing'))
  const [prefill, setPrefill] = useState<{ origin: Place | null; destination: Place | null }>({ origin: null, destination: null })

  useEffect(() => {
    const onHash = () => setView(window.location.hash === PLAN_HASH ? 'plan' : 'landing')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const start = useCallback((origin: Place | null, destination: Place | null) => {
    setPrefill({ origin, destination })
    window.location.hash = PLAN_HASH
  }, [])

  const home = useCallback(() => {
    window.location.hash = ''
  }, [])

  return view === 'plan' ? (
    <App initialOrigin={prefill.origin} initialDestination={prefill.destination} onHome={home} />
  ) : (
    <Landing onStart={start} />
  )
}
