import { describe, expect, it } from 'vitest'
import { parseStages, readViewConfig, type ViewEnv } from './config'

const STAGE = {
  position: [1, 2, 3],
  forward: [0, 0, -2],
  fov: 35,
  tolerance: { positionUnits: 5, angleDegrees: 2, fovDegrees: 0.5 },
}

const BASE: ViewEnv = {
  VIEW_SECRET: 'k'.repeat(32),
  VIEW_SOLUTION: JSON.stringify([STAGE]),
}

const UPSTASH: ViewEnv = {
  KV_REST_API_URL: 'https://example.upstash.io/',
  KV_REST_API_TOKEN: 'token',
}

describe('readViewConfig', () => {
  it('opens outside production with an in-memory store', () => {
    const result = readViewConfig(BASE)
    expect(result.ok && result.config.store).toEqual({ kind: 'memory' })
  })

  it('refuses an in-memory store in production', () => {
    const result = readViewConfig({ ...BASE, VERCEL: '1', VERCEL_ENV: 'production' })
    expect(result.ok).toBe(false)
  })

  it('opens in production with the durable store', () => {
    const result = readViewConfig({ ...BASE, ...UPSTASH, VERCEL: '1', VERCEL_ENV: 'production' })
    expect(result.ok && result.config.store).toEqual({
      kind: 'upstash',
      url: 'https://example.upstash.io',
      token: 'token',
    })
  })

  it('refuses half an Upstash configuration', () => {
    expect(readViewConfig({ ...BASE, KV_REST_API_URL: 'https://x.upstash.io' }).ok).toBe(false)
  })

  it('refuses a short secret and a missing solution', () => {
    expect(readViewConfig({ ...BASE, VIEW_SECRET: 'short' }).ok).toBe(false)
    expect(readViewConfig({ VIEW_SECRET: BASE.VIEW_SECRET }).ok).toBe(false)
  })

  it('allows the verdict in development and refuses it in production', () => {
    const dev = readViewConfig({ ...BASE, VIEW_DEBUG: '1' })
    expect(dev.ok && dev.config.debug).toBe(true)
    const prod = readViewConfig({ ...BASE, ...UPSTASH, VIEW_DEBUG: '1', VERCEL: '1', VERCEL_ENV: 'production' })
    expect(prod.ok).toBe(false)
  })

  it('refuses VERCEL without VERCEL_ENV, and an unknown environment', () => {
    expect(readViewConfig({ ...BASE, VERCEL: '1' }).ok).toBe(false)
    expect(readViewConfig({ ...BASE, VERCEL_ENV: 'prod' }).ok).toBe(false)
  })

  it('refuses a limit that is not a positive number', () => {
    expect(readViewConfig({ ...BASE, VIEW_RATE_GLOBAL_PER_MINUTE: '0' }).ok).toBe(false)
  })
})

describe('parseStages', () => {
  it('normalises the forward', () => {
    const stages = parseStages(JSON.stringify([STAGE]))
    expect(typeof stages !== 'string' && stages[0].forward).toEqual([0, 0, -1])
  })

  it.each([
    ['not JSON', '{'],
    ['an empty array', '[]'],
    ['a missing tolerance', JSON.stringify([{ ...STAGE, tolerance: undefined }])],
    ['a two-component position', JSON.stringify([{ ...STAGE, position: [1, 2] }])],
    ['a zero forward', JSON.stringify([{ ...STAGE, forward: [0, 0, 0] }])],
    ['one bad stage among good ones', JSON.stringify([STAGE, { ...STAGE, fov: -1 }])],
  ])('fails on %s rather than skipping it', (_, raw) => {
    expect(typeof parseStages(raw)).toBe('string')
  })
})
