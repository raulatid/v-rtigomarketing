import { beforeEach, describe, expect, it } from 'vitest'
import type { ViewEnv } from './config'
import { respondClaim, respondView, resetViewStateForTests, WINNER_KEY } from './respond'
import { createMemoryStore, type ViewStore } from './store'
import { TOKEN_LENGTH, verifyToken } from './token'

const SECRET = 'k'.repeat(40)
const NOW = 1_790_000_000_000

const STAGE_1 = { position: [100, 50, 0], forward: [-1, 0, 0], fov: 35 }
const STAGE_2 = { position: [-200, 80, 30], forward: [0, -1, 1], fov: 35 }
const TOLERANCE = { positionUnits: 5, angleDegrees: 2, fovDegrees: 0.5 }

/** Two stages, so the chain is exercised; the second is final. Mail is a dry run. */
const ENV: ViewEnv = {
  VIEW_SECRET: SECRET,
  VIEW_SOLUTION: JSON.stringify([
    { ...STAGE_1, tolerance: TOLERANCE },
    { ...STAGE_2, tolerance: TOLERANCE },
  ]),
  MAIL_DRY_RUN: '1',
}

const MISS = { p: [0, 0, 0], f: [0, 0, -1], fov: 35 }
const AT_1 = { p: STAGE_1.position, f: STAGE_1.forward, fov: 35 }
const AT_2 = { p: STAGE_2.position, f: STAGE_2.forward, fov: 35 }

let store: ViewStore
let lines: string[]

beforeEach(() => {
  resetViewStateForTests()
  store = createMemoryStore(() => NOW)
  lines = []
})

function request(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('https://example.test/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

const options = (extra: object = {}) => ({ store, now: () => NOW, log: (l: string) => lines.push(l), ...extra })

async function view(body: unknown, env: ViewEnv = ENV, ip?: string) {
  const response = await respondView(request(body, ip), env, options())
  return { status: response.status, body: (await response.json()) as { t: string; f?: number; dbg?: unknown } }
}

async function claim(body: unknown, env: ViewEnv = ENV, extra: object = {}) {
  const response = await respondClaim(request(body), env, options(extra))
  return { status: response.status, body: (await response.json()) as { code: string | null; closed?: boolean } }
}

const stageOf = (t: string) => verifyToken(SECRET, t, NOW)

describe('respondView', () => {
  it('refuses a body that is not a sample, as the forms do', async () => {
    expect((await view({})).status).toBe(422)
    expect((await view({ ...AT_1, fov: 400 })).status).toBe(422)
    expect((await view({ ...AT_1, p: [1, 2] })).status).toBe(422)
  })

  it('answers a miss and a hit with the same shape', async () => {
    const miss = await view(MISS)
    const hit = await view(AT_1)
    expect(miss.status).toBe(200)
    expect(hit.status).toBe(200)
    expect(Object.keys(miss.body)).toEqual(['t'])
    expect(Object.keys(hit.body)).toEqual(['t'])
    expect(miss.body.t).toHaveLength(TOKEN_LENGTH)
    expect(hit.body.t).toHaveLength(TOKEN_LENGTH)
    expect(await stageOf(miss.body.t)).toBe(0)
    expect(await stageOf(hit.body.t)).toBe(1)
  })

  it('advances one stage at a time, and a miss never loses progress', async () => {
    const t1 = (await view(AT_1)).body.t
    const kept = (await view({ ...MISS, t: t1 })).body.t
    expect(await stageOf(kept)).toBe(1)
    const t2 = (await view({ ...AT_2, t: kept })).body.t
    expect(await stageOf(t2)).toBe(2)
  })

  it('does not accept stage 2 without the stage 1 token', async () => {
    expect(await stageOf((await view(AT_2)).body.t)).toBe(0)
  })

  it('stops giving verdicts past the per-address limit', async () => {
    const env = { ...ENV, VIEW_RATE_PER_HOUR: '2' }
    await view(MISS, env)
    await view(MISS, env)
    expect(await stageOf((await view(AT_1, env)).body.t)).toBe(0)
    // Another address is still answered.
    expect(await stageOf((await view(AT_1, env, '198.51.100.1')).body.t)).toBe(1)
  })

  it('stops giving verdicts past the global limit, whatever the address', async () => {
    const env = { ...ENV, VIEW_RATE_GLOBAL_PER_MINUTE: '1' }
    await view(MISS, env, '198.51.100.1')
    expect(await stageOf((await view(AT_1, env, '198.51.100.2')).body.t)).toBe(0)
  })

  it('closes once somebody has won', async () => {
    await store.setIfAbsent(WINNER_KEY, '{}')
    expect(await stageOf((await view(AT_1)).body.t)).toBe(0)
  })

  it('closes, and says why only in the log, when unconfigured', async () => {
    const answer = await view(AT_1, { VIEW_SECRET: SECRET })
    expect(answer.status).toBe(200)
    expect(answer.body.t).toHaveLength(TOKEN_LENGTH)
    expect(lines.join('\n')).toContain('VIEW_SOLUTION')
  })

  it('closes when the store is down', async () => {
    const broken: ViewStore = { ...store, exists: () => Promise.reject(new Error('down')) }
    const response = await respondView(request(AT_1), ENV, options({ store: broken }))
    expect(await stageOf(((await response.json()) as { t: string }).t)).toBe(0)
  })

  it('carries the verdict only when debugging is asked for', async () => {
    expect((await view(AT_1)).body.dbg).toBeUndefined()
    expect((await view(AT_1, { ...ENV, VIEW_DEBUG: '1' })).body.dbg).toMatchObject({ stage: 1, inside: true })
  })
})


describe('the final-stage signal', () => {
  it('is absent from a miss and from an earlier stage', async () => {
    expect((await view(MISS)).body.f).toBeUndefined()
    expect((await view(AT_1)).body.f).toBeUndefined()
  })

  it('is present once the token is of the final stage, and stays while it is held', async () => {
    const t1 = (await view(AT_1)).body.t
    const reached = await view({ ...AT_2, t: t1 })
    expect(reached.body.f).toBe(1)
    expect((await view({ ...MISS, t: reached.body.t })).body.f).toBe(1)
  })
})

describe('respondClaim', () => {
  async function finalToken(): Promise<string> {
    const t1 = (await view(AT_1)).body.t
    return (await view({ ...AT_2, t: t1 })).body.t
  }

  const claimOf = async (email: string) => ({ t: await finalToken(), email, consent: true })

  /** Resend, faked: records who each message went to, answers with `status`. */
  function fakeResend(status = 200) {
    const sent: Array<{ to: string; replyTo: string; text: string }> = []
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { to: string[]; reply_to: string; text: string }
      sent.push({ to: body.to[0], replyTo: body.reply_to, text: body.text })
      return new Response(JSON.stringify(status === 200 ? { id: 'x' } : { message: 'no' }), { status })
    }) as typeof fetch
    return { sent, fetchImpl }
  }

  const SENDING = {
    ...ENV,
    MAIL_DRY_RUN: undefined,
    RESEND_API_KEY: 're_test',
    MAIL_FROM: 'Test <no-reply@example.com>',
    MAIL_TO_OVERRIDE: 'team@example.com',
  }

  it('refuses a body that is not a claim', async () => {
    expect((await claim({})).status).toBe(422)
    expect((await claim({ t: 'x', email: 'not-an-address', consent: true })).status).toBe(422)
  })

  it('refuses a claim without consent, and stores nothing', async () => {
    const { consent: _, ...withoutConsent } = await claimOf('a@example.com')
    expect((await claim(withoutConsent)).status).toBe(422)
    expect((await claim({ ...withoutConsent, consent: 'yes' })).status).toBe(422)
    expect(await store.exists(WINNER_KEY)).toBe(false)
  })

  it('gives the first valid claim a code and records it with the consent', async () => {
    const answer = await claim(await claimOf('winner@example.com'))
    expect(answer.body.code).toMatch(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/)
    const record = JSON.parse((await store.get(WINNER_KEY))!) as Record<string, unknown>
    expect(record).toMatchObject({ code: answer.body.code, email: 'winner@example.com', consent: true })
  })

  it('tells every later claim that it is closed', async () => {
    await claim(await claimOf('first@example.com'))
    const later = await claim(await claimOf('second@example.com'))
    expect(later.body).toEqual({ code: null, closed: true })
    const record = JSON.parse((await store.get(WINNER_KEY))!) as Record<string, string>
    expect(record.email).toBe('first@example.com')
  })

  it('refuses a token that is not of the final stage, without saying closed', async () => {
    const t1 = (await view(AT_1)).body.t
    expect((await claim({ t: t1, email: 'a@example.com', consent: true })).body).toEqual({ code: null })
    expect(await store.exists(WINNER_KEY)).toBe(false)
  })

  it('notifies the team and sends the claimant their code', async () => {
    const resend = fakeResend()
    const answer = await claim(await claimOf('w@example.com'), SENDING, { fetchImpl: resend.fetchImpl })
    expect(resend.sent.map((m) => m.to)).toEqual(['team@example.com', 'w@example.com'])
    // The team can reply to the claimant; the claimant's replies reach the team.
    expect(resend.sent[0].replyTo).toBe('w@example.com')
    expect(resend.sent[1].replyTo).toBe('team@example.com')
    expect(resend.sent[1].text).toContain(answer.body.code!)
  })

  it('keeps the win when both mails fail', async () => {
    const resend = fakeResend(500)
    const answer = await claim(await claimOf('w@example.com'), SENDING, { fetchImpl: resend.fetchImpl })
    expect(answer.body.code).not.toBeNull()
    expect(await store.exists(WINNER_KEY)).toBe(true)
    const log = lines.join('\n')
    expect(log).toContain('team notification failed')
    expect(log).toContain('claimant code mail failed')
    expect(log).not.toContain('w@example.com')
  })
})
