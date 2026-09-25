import { describe, expect, it } from 'vitest'
import { formatRemaining, KEY_COOKIE, LAUNCH_AT, launchGate, SCRIPT_PATH } from './launchGate'

const KEY = 'a-long-enough-preview-key'
const env = { LAUNCH_PREVIEW_KEY: KEY }
const BEFORE = LAUNCH_AT - 90 * 60 * 1000

const get = (path: string, cookie?: string) =>
  new Request('https://vertigo.example' + path, cookie ? { headers: { cookie } } : undefined)

describe('launchGate', () => {
  it('opens at midnight in Madrid, which is 22:00 UTC on the 25th', () => {
    expect(new Date(LAUNCH_AT).toISOString()).toBe('2026-09-25T22:00:00.000Z')
  })

  it('withholds every path before the launch, assets and API included', async () => {
    for (const path of ['/', '/blog/some-post', '/assets/index.js', '/models/murcia.glb', '/api/contact']) {
      const response = launchGate(get(path), env, BEFORE)
      expect(response?.status).toBe(503)
      expect(response?.headers.get('cache-control')).toBe('no-store')
      expect(response?.headers.get('x-robots-tag')).toContain('noindex')
    }
    const html = await launchGate(get('/'), env, BEFORE)!.text()
    expect(html).toContain('data-remaining="5400000"')
    expect(html).toContain('01:30:00')
  })

  it('lets everything through from the launch moment on', () => {
    expect(launchGate(get('/'), env, LAUNCH_AT)).toBeUndefined()
    expect(launchGate(get('/assets/index.js'), {}, LAUNCH_AT + 1)).toBeUndefined()
  })

  it('serves its own script and the fonts while shut', () => {
    const script = launchGate(get(SCRIPT_PATH), env, BEFORE)
    expect(script?.status).toBe(200)
    expect(script?.headers.get('content-type')).toContain('javascript')
    expect(launchGate(get('/fonts/general-sans-variable-49d3fbd2.woff2'), env, BEFORE)).toBeUndefined()
  })

  it('trades the right key for a cookie and strips it from the address', () => {
    const response = launchGate(get('/blog?launch-key=' + KEY + '&x=1'), env, BEFORE)
    expect(response?.status).toBe(303)
    expect(response?.headers.get('location')).toBe('/blog?x=1')
    const cookie = response?.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(KEY_COOKIE + '=' + KEY)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
  })

  it('lets a request with the cookie through', () => {
    expect(launchGate(get('/models/murcia.glb', KEY_COOKIE + '=' + KEY), env, BEFORE)).toBeUndefined()
  })

  it('refuses a wrong key, a wrong cookie, and a key sharing only a prefix', () => {
    expect(launchGate(get('/?launch-key=nope'), env, BEFORE)?.status).toBe(503)
    expect(launchGate(get('/?launch-key=' + KEY + 'x'), env, BEFORE)?.status).toBe(503)
    expect(launchGate(get('/?launch-key=' + KEY.slice(0, -1)), env, BEFORE)?.status).toBe(503)
    expect(launchGate(get('/', KEY_COOKIE + '=nope'), env, BEFORE)?.status).toBe(503)
  })

  it('stays shut for everyone when the key is missing or too short', () => {
    expect(launchGate(get('/?launch-key='), {}, BEFORE)?.status).toBe(503)
    expect(launchGate(get('/', KEY_COOKIE + '='), {}, BEFORE)?.status).toBe(503)
    expect(launchGate(get('/?launch-key=short'), { LAUNCH_PREVIEW_KEY: 'short' }, BEFORE)?.status).toBe(503)
  })
})

describe('formatRemaining', () => {
  it('counts hours past a day and never goes negative', () => {
    expect(formatRemaining(26 * 3600_000 + 61_000)).toBe('26:01:01')
    expect(formatRemaining(1)).toBe('00:00:01')
    expect(formatRemaining(-5000)).toBe('00:00:00')
  })
})
