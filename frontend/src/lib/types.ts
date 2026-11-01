export type RiskKey = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel'
export type LevelKey = RiskKey | 'unknown'

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface Checkpoint {
  index: number
  mile: number
  lat: number
  lon: number
  eta: string
  covered_miles: number
  level: LevelKey
  label: string
  reasons: string[]
  wind_mph?: number
  gust_mph?: number
  rain_in_hr?: number
  snow_in_hr?: number
  forecast_hour?: string
  levels?: { wind: RiskKey; rain: RiskKey; snow: RiskKey; load: RiskKey }
}

export interface RouteSummary {
  miles_by_level: Record<LevelKey, number>
  severe_miles: number
  high_miles: number
  no_travel_miles: number
  unknown_miles: number
  average_risk: number
  max_level: LevelKey
}

export interface Step {
  type: string
  modifier: string
  exit: number | null
  name: string
  ref: string
  distance_miles: number
  duration_seconds: number
  lat: number
  lon: number
}

export interface Route {
  id: string
  name: string
  rank: number
  source: 'fastest' | 'alternative' | 'via'
  distance_miles: number
  duration_seconds: number
  departure: string
  arrival: string
  summary: RouteSummary
  checkpoints: Checkpoint[]
  geometry: [number, number][]
  steps: Step[]
}

export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}

export interface Simulation {
  scenario: string
  label: string
  detail: string
}

export interface Plan {
  routes: Route[]
  recommended_id: string
  recommendation: { route_id: string; reason: string; warning: string | null }
  bounds: Bounds
  inputs: { departure: string; load_lb: number; interval_miles: number; timezone: string }
  /** Why fewer than three routes were offered (null when all three were found). */
  route_notice: string | null
  /** Present only in local development, when the simulated storm is on. */
  simulation?: Simulation
}

export interface Heatmap {
  start: string
  hours: number
  rows: number
  cols: number
  bounds: Bounds
  levels: number[][]
  scores: number[][]
  /** 0..1 per cell: how strongly the overlay shows, fading out toward the edge of the corridor band. */
  mask?: number[]
  simulation?: Simulation
}

export interface PlanRequest {
  origin: Place
  destination: Place
  departure_time: string
  load_weight_lb: number
  checkpoint_interval_miles: 10 | 25 | 50
}

export interface Condition {
  name: string
  wind_mph: number
  level: LevelKey
  label: string
}
