import { describe, expect, it } from 'vitest'
import { createMemoryStore, createUpstashStore, StoreError } from './store'

describe('createMemoryStore', () => {
  it('counts within a window and starts again after it', async () => {
    let now = 0
    const store = createMemoryStore(() => now)
    expect(await store.incr('k', 10)).toBe(1)
    expect(await store.incr('k', 10)).toBe(2)
    now = 10_001
    expect(await store.incr('k', 10)).toBe(1)
  })

  it('writes only the first value', async () => {
    const store = createMemoryStore()
    expect(await store.setIfAbsent('w', 'a')).toBe(true)
    expect(await store.setIfAbsent('w', 'b')).toBe(false)
    expect(await store.get('w')).toBe('a')
    expect(await store.exists('w')).toBe(true)
  })
})

/** A fake Upstash that answers each pipeline with `results`, and records what it was sent. */
function fakeUpstash(answer: (commands: unknown[][]) => Response) {
  const calls: Array<{ url: string; auth: string | null; commands: unknown[][] }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const commands = JSON.parse(String(init?.body)) as unknown[][]
    calls.push({ url: String(input), auth: new Headers(init?.headers).get('authorization'), commands })
    return answer(commands)
  }) as typeof fetch
  const store = createUpstashStore({ url: 'https://x.upstash.io', token: 'tok', timeoutMs: 1000, fetchImpl })
  return { store, calls }
}

const results = (...values: unknown[]) =>
  new Response(JSON.stringify(values.map((result) => ({ result }))), { status: 200 })

describe('createUpstashStore', () => {
  it('seeds the expiry once and then counts, in one pipeline', async () => {
    const { store, calls } = fakeUpstash(() => results('OK', 1))
    expect(await store.incr('k', 60)).toBe(1)
    expect(calls[0].url).toBe('https://x.upstash.io/pipeline')
    expect(calls[0].auth).toBe('Bearer tok')
    expect(calls[0].commands).toEqual([
      ['SET', 'k', 0, 'EX', 60, 'NX'],
      ['INCR', 'k'],
    ])
  })

  it('reports whether SET NX wrote', async () => {
    expect(await fakeUpstash(() => results('OK')).store.setIfAbsent('w', 'v')).toBe(true)
    expect(await fakeUpstash(() => results(null)).store.setIfAbsent('w', 'v')).toBe(false)
  })

  it('never passes the upstream body on', async () => {
    const { store } = fakeUpstash(() => new Response('secret-bearing error body', { status: 401 }))
    const error = await store.exists('w').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StoreError)
    expect((error as Error).message).not.toContain('secret')
  })

  it('fails on a command error inside a 200', async () => {
    const { store } = fakeUpstash(() => new Response(JSON.stringify([{ error: 'WRONGTYPE' }]), { status: 200 }))
    await expect(store.get('w')).rejects.toBeInstanceOf(StoreError)
  })
})
