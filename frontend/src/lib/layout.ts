export type Dock = 'left' | 'bottom'
export type PanelSize = 'comfort' | 'wide'

export interface PanelLayout {
  dock: Dock
  size: PanelSize
  hidden: boolean
}

const KEY = 'wat-routing-panel-layout'
const DEFAULT: PanelLayout = { dock: 'left', size: 'comfort', hidden: false }

/** The driver's panel preference survives a reload; storage can be blocked, so every access is guarded. */
export function loadLayout(): PanelLayout {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<PanelLayout>
    return {
      dock: parsed.dock === 'bottom' ? 'bottom' : 'left',
      size: parsed.size === 'wide' ? 'wide' : 'comfort',
      hidden: parsed.hidden === true,
    }
  } catch {
    return DEFAULT
  }
}

export function saveLayout(layout: PanelLayout): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    /* private mode or blocked storage: the layout simply is not remembered */
  }
}
