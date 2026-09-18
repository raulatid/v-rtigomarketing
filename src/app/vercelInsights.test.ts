// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Both modules keep module-level state, so each test imports fresh copies — and
// the build flag is mocked because vitest has no production define.
async function fresh(enabled = true) {
  vi.resetModules()
  vi.doMock('../platform/buildFlags', () => ({ VERCEL_INSIGHTS_ENABLED: enabled }))
  const consent = await import('./consent')
  const insights = await import('./vercelInsights')
  return { ...consent, ...insights }
}

function scripts(): string[] {
  return [...document.head.querySelectorAll('script')].map((s) => s.getAttribute('src') ?? '')
}

type Queued = unknown[][]
const scope = window as unknown as Record<string, unknown>

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = ''
  for (const key of ['va', 'vaq', 'si', 'siq']) delete scope[key]
})

afterEach(() => {
  vi.doUnmock('../platform/buildFlags')
})

describe('startVercelInsights', () => {
  it('loads nothing before the visitor has answered', async () => {
    const { startVercelInsights } = await fresh()
    startVercelInsights()
    expect(scripts()).toEqual([])
  })

  it('loads nothing when analytics was refused', async () => {
    const { startVercelInsights, writeConsent } = await fresh()
    startVercelInsights()
    writeConsent({ analytics: false, preferences: true })
    expect(scripts()).toEqual([])
  })

  it('loads both same-origin scripts once, on the first yes', async () => {
    const { startVercelInsights, writeConsent } = await fresh()
    startVercelInsights()
    writeConsent({ analytics: true, preferences: true })
    writeConsent({ analytics: true, preferences: false })
    expect(scripts()).toEqual(['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js'])
  })

  it('loads at once for a stored yes', async () => {
    const first = await fresh()
    first.writeConsent({ analytics: true, preferences: true })
    const { startVercelInsights } = await fresh()
    startVercelInsights()
    expect(scripts()).toHaveLength(2)
  })

  it('drops every event once consent is withdrawn', async () => {
    const { startVercelInsights, writeConsent } = await fresh()
    startVercelInsights()
    writeConsent({ analytics: true, preferences: true })

    for (const queue of ['vaq', 'siq']) {
      const [command, beforeSend] = (scope[queue] as Queued)[0] as [string, (e: object) => unknown]
      expect(command).toBe('beforeSend')
      const event = { url: '/' }
      expect(beforeSend(event)).toBe(event)
    }

    writeConsent({ analytics: false, preferences: true })
    for (const queue of ['vaq', 'siq']) {
      const [, beforeSend] = (scope[queue] as Queued)[0] as [string, (e: object) => unknown]
      expect(beforeSend({ url: '/' })).toBeNull()
    }
  })

  it('does nothing outside a production deployment', async () => {
    const { startVercelInsights, writeConsent } = await fresh(false)
    startVercelInsights()
    writeConsent({ analytics: true, preferences: true })
    expect(scripts()).toEqual([])
  })
})
