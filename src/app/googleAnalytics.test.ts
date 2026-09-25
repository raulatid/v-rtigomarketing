// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Both modules keep module-level state, so each test imports fresh copies — and
// the build flag is mocked because vitest has no production define.
async function fresh(enabled = true) {
  vi.resetModules()
  vi.doMock('../platform/buildFlags', () => ({ GOOGLE_ANALYTICS_ENABLED: enabled }))
  const consent = await import('./consent')
  const analytics = await import('./googleAnalytics')
  return { ...consent, ...analytics }
}

function scripts(): string[] {
  return [...document.head.querySelectorAll('script')].map((s) => s.getAttribute('src') ?? '')
}

const scope = window as unknown as Record<string, unknown>
const disableKey = 'ga-disable-G-G3W0LS6QEX'
const gtagSrc = 'https://www.googletagmanager.com/gtag/js?id=G-G3W0LS6QEX'

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = ''
  delete scope.dataLayer
  delete scope[disableKey]
})

afterEach(() => {
  vi.doUnmock('../platform/buildFlags')
})

describe('startGoogleAnalytics', () => {
  it('loads nothing before the visitor has answered', async () => {
    const { startGoogleAnalytics } = await fresh()
    startGoogleAnalytics()
    expect(scripts()).toEqual([])
    expect(scope.dataLayer).toBeUndefined()
  })

  it('loads nothing when analytics was refused', async () => {
    const { startGoogleAnalytics, writeConsent } = await fresh()
    startGoogleAnalytics()
    writeConsent({ analytics: false, preferences: true })
    expect(scripts()).toEqual([])
    expect(scope[disableKey]).toBe(true)
  })

  it('loads gtag.js once, on the first yes, with advertising denied', async () => {
    const { startGoogleAnalytics, writeConsent } = await fresh()
    startGoogleAnalytics()
    writeConsent({ analytics: true, preferences: true })
    writeConsent({ analytics: true, preferences: false })
    expect(scripts()).toEqual([gtagSrc])
    expect(scope[disableKey]).toBe(false)

    const layer = (scope.dataLayer as IArguments[]).map((entry) => [...entry])
    expect(layer[0]).toEqual([
      'consent',
      'default',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
    expect(layer.at(-1)).toEqual(['config', 'G-G3W0LS6QEX'])
  })

  it('loads at once for a stored yes', async () => {
    const first = await fresh()
    first.writeConsent({ analytics: true, preferences: true })
    const { startGoogleAnalytics } = await fresh()
    startGoogleAnalytics()
    expect(scripts()).toEqual([gtagSrc])
  })

  it('stops every hit and clears its cookies once consent is withdrawn', async () => {
    const { startGoogleAnalytics, writeConsent } = await fresh()
    startGoogleAnalytics()
    writeConsent({ analytics: true, preferences: true })
    document.cookie = '_ga=GA1.1.1; path=/'
    document.cookie = '_ga_G3W0LS6QEX=GS1.1.1; path=/'
    document.cookie = 'unrelated=1; path=/'

    writeConsent({ analytics: false, preferences: true })
    expect(scope[disableKey]).toBe(true)
    expect(document.cookie).toBe('unrelated=1')
  })

  it('does nothing outside a production deployment', async () => {
    const { startGoogleAnalytics, writeConsent } = await fresh(false)
    startGoogleAnalytics()
    writeConsent({ analytics: true, preferences: true })
    expect(scripts()).toEqual([])
  })
})
