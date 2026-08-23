import { describe, expect, it } from 'vitest'
import type { SanitySourceSpec } from '../collections/types'
import { sanitySource } from './sanity'
import { SourceError } from './source'

/**
 * A fake Content Lake endpoint.
 *
 * Records the URL and the request HEADERS of every call. The headers are the
 * point: "no Authorization unless a token exists" is the security property this
 * adapter carries, and it is invisible from the response. The WordPress fake this
 * replaces never captured them, because pagination was the only thing it tested.
 */
function fakeSanity(body: unknown, init: ResponseInit = {}) {
  const calls: string[] = []
  const headers: Array<Record<string, string>> = []
  const impl = (async (url: string, request: RequestInit = {}) => {
    calls.push(url)
    // `new Headers` lowercases names, so assertions read `.authorization`.
    headers.push(Object.fromEntries(new Headers(request.headers ?? {}).entries()))
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  }) as unknown as typeof fetch
  return { impl, calls, headers }
}

/** N plausible projected records. */
function records(n: number): Array<{ id: string }> {
  return Array.from({ length: n }, (_, i) => ({ id: 'r' + i }))
}

const spec: SanitySourceSpec = {
  type: 'caseStudy',
  projection: '{ "id": slug.current, name }',
  orderBy: 'slug.current asc',
}

const address = { projectId: 'p1abc234', dataset: 'production' }

/** The decoded GROQ of a request URL. */
function queryOf(url: string): string {
  return new URL(url).searchParams.get('query') ?? ''
}

describe('the Sanity query', () => {
  it('addresses the project, dataset and pinned API version', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    // The version literal is hardcoded on purpose: bumping SANITY_API_VERSION is
    // a protocol decision and must break a test rather than pass silently.
    expect(fake.calls[0]).toMatch(
      /^https:\/\/p1abc234\.api\.sanity\.io\/v2026-08-23\/data\/query\/production\?query=/,
    )
  })

  it('reads the live API, never the query CDN', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    // A CDN-cached query response is how a build fired by a publish webhook ends
    // up shipping the content from before that publish.
    expect(fake.calls[0]).not.toContain('apicdn')
  })

  it('percent-encodes the GROQ rather than form-encoding it', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    // Asserted on the RAW url, not on the decoded value: URLSearchParams writes a
    // space as `+`, which round-trips cleanly through searchParams.get and would
    // pass a decoded assertion while changing what the server parses. A space is
    // %20 and the GROQ carries no legitimate `+`, so either character in the raw
    // URL means the serializer changed.
    expect(fake.calls[0]).toContain('%20')
    expect(fake.calls[0]).not.toContain(' ')
    expect(fake.calls[0]).not.toContain('+')
    // The structural punctuation is escaped too. `*` is not: encodeURIComponent
    // leaves it alone, and it is legal unescaped in a query string.
    expect(fake.calls[0]).not.toMatch(/["{}|]/)
  })

  it('excludes drafts in the filter', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    expect(queryOf(fake.calls[0])).toContain('!(_id in path("drafts.**"))')
  })

  it('carries the collection type and the projection verbatim', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    const query = queryOf(fake.calls[0])
    expect(query).toContain('_type == "caseStudy"')
    expect(query).toContain('{ "id": slug.current, name }')
  })

  it('orders by what the collection asked for', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    expect(queryOf(fake.calls[0])).toContain('| order(slug.current asc)')
  })

  it('orders by _id when a collection names nothing', async () => {
    const fake = fakeSanity({ result: records(1) })
    const unordered: SanitySourceSpec = { type: 'district', projection: '{ "id": slug.current }' }
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(unordered)
    // No query is ever unordered: byte-identical output for unchanged content is
    // what makes "no file changed" mean anything.
    expect(queryOf(fake.calls[0])).toContain('| order(_id asc)')
  })

  it('asks for one record past the ceiling', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    expect(queryOf(fake.calls[0])).toContain('[0...1001]')
  })

  it('rejects a projection that is not a block', async () => {
    const fake = fakeSanity({ result: records(1) })
    const malformed: SanitySourceSpec = { type: 'caseStudy', projection: '"id": slug.current' }
    await expect(
      sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(malformed),
    ).rejects.toThrow(/must be a \{ \.\.\. \} block/)
  })
})

describe('the Sanity source', () => {
  it('fails on a non-2xx', async () => {
    const fake = fakeSanity('service unavailable', { status: 503, statusText: 'Service Unavailable' })
    const promise = sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    await expect(promise).rejects.toBeInstanceOf(SourceError)
    await expect(promise).rejects.toThrow(/503/)
  })

  it('fails on a body that is not JSON', async () => {
    const fake = fakeSanity('<html>502 Bad Gateway</html>')
    const promise = sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    // The TYPE is asserted, not just that it threw: the build log distinguishes a
    // source failure from a content failure, and only SourceError is a source one.
    await expect(promise).rejects.toBeInstanceOf(SourceError)
    await expect(promise).rejects.toThrow(/not valid JSON/)
  })

  it('fails when there is no result field', async () => {
    const fake = fakeSanity({})
    await expect(sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)).rejects.toThrow(
      /no `result` field/,
    )
  })

  it('fails when result is not an array', async () => {
    const fake = fakeSanity({ result: { id: 'x' } })
    await expect(sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)).rejects.toThrow(
      /expected an array/,
    )
  })

  it('fails on an error payload even at status 200', async () => {
    const fake = fakeSanity({
      error: { description: 'unable to parse query', type: 'queryParseError' },
    })
    // A 200 carrying an error must never read as "no records" — that would empty
    // a collection rather than fail the build.
    await expect(sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)).rejects.toThrow(
      /unable to parse query/,
    )
  })

  it('fails when the request times out', async () => {
    const abortOnly = (async (_url: string, init: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const error = new Error('aborted')
      error.name = 'AbortError'
      if (init.signal?.aborted) throw error
      throw error
    }) as unknown as typeof fetch
    await expect(
      sanitySource({ ...address, fetchImpl: abortOnly, timeoutMs: 10 }).fetchAll(spec),
    ).rejects.toThrow(/timed out/)
  })

  it('fails when the request never reaches the server', async () => {
    const refuse = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(sanitySource({ ...address, fetchImpl: refuse }).fetchAll(spec)).rejects.toThrow(
      /request failed/,
    )
  })
})

describe('the Sanity credential', () => {
  it('sends no Authorization header when there is no token', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    expect(fake.headers[0].authorization).toBeUndefined()
  })

  it('sends no Authorization header for a blank token', async () => {
    const fake = fakeSanity({ result: records(1) })
    // A Vercel variable that exists but was never filled in arrives as ''. A bare
    // `Bearer ` is a 401 that reads like a permissions problem.
    await sanitySource({ ...address, fetchImpl: fake.impl, token: '' }).fetchAll(spec)
    expect(fake.headers[0].authorization).toBeUndefined()
  })

  it('sends a Bearer token when one exists', async () => {
    const fake = fakeSanity({ result: records(1) })
    await sanitySource({ ...address, fetchImpl: fake.impl, token: 'sk-test-value' }).fetchAll(spec)
    expect(fake.headers[0].authorization).toBe('Bearer sk-test-value')
  })

  it('never puts the token in the URL or the build log', async () => {
    const fake = fakeSanity({ result: records(1) })
    const source = sanitySource({ ...address, fetchImpl: fake.impl, token: 'sk-test-value' })
    await source.fetchAll(spec)
    // generate() logs `describe` on every build, and build logs outlive the token.
    expect(fake.calls[0]).not.toContain('sk-test-value')
    expect(source.describe).not.toContain('sk-test-value')
  })
})

describe('the collection ceiling', () => {
  it('accepts exactly the maximum', async () => {
    const fake = fakeSanity({ result: records(1000) })
    const result = await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    // Asking for [0...1000] and rejecting a full page would reject a legitimate
    // collection of exactly 1000 documents. The sentinel is what tells "full"
    // apart from "overflowing".
    expect(result).toHaveLength(1000)
  })

  it('rejects one past the maximum rather than truncating', async () => {
    const fake = fakeSanity({ result: records(1001) })
    await expect(sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)).rejects.toThrow(
      /more than 1000/,
    )
  })

  it('accepts an ordinary small collection', async () => {
    const fake = fakeSanity({ result: records(1) })
    const result = await sanitySource({ ...address, fetchImpl: fake.impl }).fetchAll(spec)
    expect(result).toHaveLength(1)
  })
})

describe('a malformed Sanity address', () => {
  it('rejects a project id that is not one', () => {
    // The project id is interpolated into the HOSTNAME. This is the guard that
    // stops a typo'd or hostile variable redirecting a credentialed request.
    expect(() => sanitySource({ projectId: 'evil.com/x', dataset: 'production' })).toThrow(SourceError)
  })

  it('rejects a dataset name that is not one', () => {
    expect(() => sanitySource({ projectId: 'p1abc234', dataset: '../other' })).toThrow(SourceError)
  })
})
