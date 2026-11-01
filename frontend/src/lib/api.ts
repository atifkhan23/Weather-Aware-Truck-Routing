import type { Bounds, Condition, Heatmap, Place, Plan, PlanRequest } from './types'

// In development the Vite dev server proxies /api to Django (see vite.config.ts), so
// requests stay same-origin. Production builds call the deployed API directly.
const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  fields?: Record<string, unknown>
  constructor(message: string, fields?: Record<string, unknown>) {
    super(message)
    this.fields = fields
  }
}

/** Flattens DRF-style field errors into one readable line. */
function describeFields(fields: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    const name = key === 'non_field_errors' ? prefix : `${prefix}${key.replace(/_/g, ' ')}`
    if (Array.isArray(value)) {
      out.push(`${name ? `${name}: ` : ''}${value.map(String).join(' ')}`)
    } else if (value && typeof value === 'object') {
      out.push(...describeFields(value as Record<string, unknown>, `${name} `))
    }
  }
  return out
}

async function request<T>(path: string, init: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      credentials: 'omit',
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Check your connection and try again.')
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    /* non-JSON error page */
  }

  if (!response.ok) {
    const data = (body ?? {}) as { error?: string; fields?: Record<string, unknown> }
    const detail = data.fields ? describeFields(data.fields).join(' · ') : ''
    if (response.status === 429) throw new ApiError('Too many requests. Please wait a moment and try again.')
    throw new ApiError(detail || data.error || `Request failed (${response.status}).`, data.fields)
  }
  return body as T
}

export function searchPlaces(q: string, signal?: AbortSignal) {
  return request<{ results: Place[] }>(`/api/geocode/?q=${encodeURIComponent(q)}`, { method: 'GET', signal })
}

export async function planTrip(body: PlanRequest, signal?: AbortSignal) {
  const plan = await request<Plan>('/api/plan/', { method: 'POST', body: JSON.stringify(body), signal })
  // Turn-by-turn steps are an extra: an older or partial response must never break the core plan.
  return { ...plan, route_notice: plan.route_notice ?? null, routes: plan.routes.map((r) => ({ ...r, steps: Array.isArray(r.steps) ? r.steps : [] })) }
}

export function fetchHeatmap(bounds: Bounds, loadWeightLb: number, corridor: [number, number][][], signal?: AbortSignal) {
  return request<Heatmap>('/api/heatmap/', {
    method: 'POST',
    body: JSON.stringify({ ...bounds, load_weight_lb: loadWeightLb, corridor }),
    signal,
  })
}

export function fetchTimezone(lat: number, lon: number, signal?: AbortSignal) {
  return request<{ timezone: string }>(`/api/timezone/?lat=${lat}&lon=${lon}`, { method: 'GET', signal })
}

export function fetchConditions(signal?: AbortSignal) {
  return request<{ hubs: Condition[] }>('/api/conditions/', { method: 'GET', signal })
}


export function reverseGeocode(lat: number, lon: number, signal?: AbortSignal) {
  return request<Place>('/api/reverse/?lat=' + lat + '&lon=' + lon, { method: 'GET', signal })
}
