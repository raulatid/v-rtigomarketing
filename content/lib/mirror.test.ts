import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SanitySourceSpec } from '../collections/types'
import { withMediaMirror } from './mirror'
import { SourceError, type ContentSource } from './source'

const CDN = 'https://cdn.sanity.io'
const LOGO = CDN + '/images/p1/production/9f8e7d6c5b4a-512x512.png'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const spec: SanitySourceSpec = {
  type: 'caseStudy',
  projection: '{ "id": slug.current, logo }',
  mirror: ['logo'],
}

/** A source that hands back exactly the records a test wrote. */
function inner(records: unknown[]): ContentSource {
  return { describe: 'stub', fetchAll: async () => structuredClone(records) }
}

/** A CDN that serves `bytes` for every request and counts the calls. */
function fakeCdn(bytes: Uint8Array, init: ResponseInit = {}) {
  const calls: string[] = []
  const impl = (async (url: string) => {
    calls.push(url)
    // `.buffer` rather than the view: TS's BodyInit does not admit a typed array,
    // and every array here is exactly the size of its own buffer.
    return new Response(bytes.buffer as ArrayBuffer, { status: 200, ...init })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])

function mirror(records: unknown[], fetchImpl: typeof fetch) {
  return withMediaMirror(inner(records), {
    dir,
    publicPath: '/logos',
    allowedOrigin: CDN,
    fetchImpl,
  }).fetchAll(spec)
}

describe('mirroring CMS media', () => {
  it('writes the file and rewrites the reference to a local path', async () => {
    const cdn = fakeCdn(png())
    const [record] = (await mirror([{ id: 'mango', logo: LOGO }], cdn.impl)) as Array<{ logo: string }>
    // The name is Sanity's content-addressed basename, so the same image always
    // produces the same bytes in the emitted module across builds.
    expect(record.logo).toBe('/logos/9f8e7d6c5b4a-512x512.png')
    expect(fs.readFileSync(path.join(dir, '9f8e7d6c5b4a-512x512.png'))).toEqual(
      Buffer.from(png()),
    )
  })

  it('does not re-download a file it already has', async () => {
    const cdn = fakeCdn(png())
    await mirror([{ id: 'mango', logo: LOGO }], cdn.impl)
    await mirror([{ id: 'mango', logo: LOGO }], cdn.impl)
    // Content-addressed: a file already on disk is already the right bytes.
    expect(cdn.calls).toHaveLength(1)
  })

  it('leaves an absent logo alone', async () => {
    const cdn = fakeCdn(png())
    const records = (await mirror(
      [{ id: 'a', logo: null }, { id: 'b' }, { id: 'c', logo: '' }],
      cdn.impl,
    )) as Array<Record<string, unknown>>
    // The atlas draws its own plate, so no logo is a designed state.
    expect(cdn.calls).toHaveLength(0)
    expect(records[0].logo).toBeNull()
    expect(records[2].logo).toBe('')
  })

  it('does nothing at all when a collection declares no media', async () => {
    const cdn = fakeCdn(png())
    const bare: SanitySourceSpec = { type: 'district', projection: '{ "id": slug.current }' }
    const source = withMediaMirror(inner([{ id: 'servicios', logo: LOGO }]), {
      dir,
      publicPath: '/logos',
      allowedOrigin: CDN,
      fetchImpl: cdn.impl,
    })
    const [record] = (await source.fetchAll(bare)) as Array<{ logo: string }>
    expect(cdn.calls).toHaveLength(0)
    expect(record.logo).toBe(LOGO)
  })
})

describe('media the mirror refuses to fetch', () => {
  it('rejects an origin that is not the CMS', async () => {
    const cdn = fakeCdn(png())
    // Parsed-origin comparison, not a string prefix — SEC-1.
    await expect(
      mirror([{ id: 'a', logo: 'https://evil.example/images/x.png' }], cdn.impl),
    ).rejects.toThrow(/is not the CMS origin/)
    expect(cdn.calls).toHaveLength(0)
  })

  it('rejects plain http', async () => {
    const cdn = fakeCdn(png())
    await expect(
      mirror([{ id: 'a', logo: 'http://cdn.sanity.io/images/x.png' }], cdn.impl),
    ).rejects.toThrow(/must be https/)
  })

  it('rejects SVG', async () => {
    const cdn = fakeCdn(png())
    // An SVG is served at its own URL, so it is stored XSS for anyone who opens
    // it directly. The logo policy defers SVG deliberately; enabling it should be
    // a reviewed change, not an upload nobody noticed.
    await expect(
      mirror([{ id: 'a', logo: CDN + '/images/p1/production/abc-1x1.svg' }], cdn.impl),
    ).rejects.toThrow(/SVG is not an allowed logo format/)
  })

  it('rejects something that is not a URL at all', async () => {
    const cdn = fakeCdn(png())
    await expect(mirror([{ id: 'a', logo: 'not-a-url' }], cdn.impl)).rejects.toThrow(
      /is not an absolute URL/,
    )
  })

  it('names the record and field it failed on', async () => {
    const cdn = fakeCdn(png())
    await expect(
      mirror([{ id: 'a', logo: LOGO }, { id: 'b', logo: 'nope' }], cdn.impl),
    ).rejects.toThrow(/caseStudy\[1\]\.logo/)
  })
})

describe('media the mirror cannot retrieve', () => {
  it('fails the build on a missing asset rather than shipping no logo', async () => {
    const missing = (async () =>
      new Response('not found', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch
    // The content and the media library disagreeing is not an editorial state.
    const promise = mirror([{ id: 'a', logo: LOGO }], missing)
    await expect(promise).rejects.toBeInstanceOf(SourceError)
    await expect(promise).rejects.toThrow(/404/)
  })

  it('fails on an empty file', async () => {
    const empty = fakeCdn(new Uint8Array())
    await expect(mirror([{ id: 'a', logo: LOGO }], empty.impl)).rejects.toThrow(/is empty/)
  })

  it('fails on an asset past the size cap', async () => {
    const huge = fakeCdn(new Uint8Array(4 * 1024 * 1024 + 1))
    await expect(mirror([{ id: 'a', logo: LOGO }], huge.impl)).rejects.toThrow(/over the/)
  })

  it('writes nothing when it fails', async () => {
    const missing = (async () =>
      new Response('not found', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch
    await expect(mirror([{ id: 'a', logo: LOGO }], missing)).rejects.toThrow()
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([])
  })
})

/**
 * The format and geometry tier.
 *
 * Its whole point is that nothing is downloaded to reach a verdict: Sanity names
 * an asset `<hash>-<w>x<h>.<ext>`, so every assertion below also checks that the
 * fake CDN was never called.
 */
describe('brand marks the mirror refuses on format or geometry', () => {
  const RULES: SanitySourceSpec = {
    type: 'caseStudy',
    projection: '{ "id": slug.current, isotype, logo }',
    mirror: ['isotype', 'logo'],
    mediaRules: {
      isotype: {
        extensions: ['png', 'webp'],
        minAspect: 0.75,
        maxAspect: 4 / 3,
      },
      logo: {
        extensions: ['png', 'webp'],
        minAspect: 1.5,
        maxAspect: 5,
      },
    },
  }

  const asset = (name: string) => CDN + '/images/p1/production/' + name

  function ruled(records: unknown[], fetchImpl: typeof fetch) {
    return withMediaMirror(inner(records), {
      dir,
      publicPath: '/logos',
      allowedOrigin: CDN,
      fetchImpl,
    }).fetchAll(RULES)
  }

  const pair = (isotype: string, logo: string) => [{ id: 'a', isotype, logo }]
  const GOOD_ISO = asset('aaa-512x512.png')
  const GOOD_LOGO = asset('bbb-1600x800.webp')

  it('accepts artwork that meets the spec', async () => {
    const cdn = fakeCdn(png())
    const [record] = (await ruled(pair(GOOD_ISO, GOOD_LOGO), cdn.impl)) as Array<{
      isotype: string
      logo: string
    }>
    expect(record.isotype).toBe('/logos/aaa-512x512.png')
    expect(record.logo).toBe('/logos/bbb-1600x800.webp')
  })

  it('rejects a JPEG, which has no alpha and would ship a rectangle', async () => {
    const cdn = fakeCdn(png())
    await expect(ruled(pair(asset('aaa-512x512.jpg'), GOOD_LOGO), cdn.impl)).rejects.toThrow(
      /\.jpg is not allowed; must be one of \.png, \.webp/,
    )
    expect(cdn.calls).toHaveLength(0)
  })

  it('still refuses SVG by its own name, not as a disallowed extension', async () => {
    const cdn = fakeCdn(png())
    // Two different arguments — stored XSS, versus a missing alpha channel — so
    // they stay two different messages even now that an allowlist exists.
    await expect(ruled(pair(asset('aaa-512x512.svg'), GOOD_LOGO), cdn.impl)).rejects.toThrow(
      /SVG is not an allowed logo format/,
    )
  })

  it('accepts an isotype below the atlas box it is drawn into', async () => {
    const cdn = fakeCdn(png())
    // The atlas upscales it and it draws soft. That is a quality trade-off the
    // Studio advises on, not a wrong deployment — some brands have no larger
    // artwork, and the build used to refuse them outright.
    await expect(ruled(pair(asset('aaa-300x300.png'), GOOD_LOGO), cdn.impl)).resolves.toBeDefined()
  })

  it('rejects an isotype that is not close to square', async () => {
    const cdn = fakeCdn(png())
    await expect(ruled(pair(asset('aaa-900x640.png'), GOOD_LOGO), cdn.impl)).rejects.toThrow(
      /outside the allowed 0.75:1 to 1.3333333333333333:1/,
    )
  })

  it('tolerates an isotype that is square-ish rather than exactly square', async () => {
    const cdn = fakeCdn(png())
    // The Studio warns about this; the build does not stop a deploy over it.
    await expect(ruled(pair(asset('aaa-512x540.png'), GOOD_LOGO), cdn.impl)).resolves.toBeDefined()
  })

  it('accepts a logo narrower than the box, which upscales and softens', async () => {
    const cdn = fakeCdn(png())
    await expect(ruled(pair(GOOD_ISO, asset('bbb-800x400.png')), cdn.impl)).resolves.toBeDefined()
  })

  it('rejects a logo that is too tall for the 2:1 expanded panel', async () => {
    const cdn = fakeCdn(png())
    await expect(ruled(pair(GOOD_ISO, asset('bbb-1000x800.png')), cdn.impl)).rejects.toThrow(
      /logo: is 1000x800 \(1.25:1\), outside the allowed 1.5:1 to 5:1/,
    )
  })

  it('rejects a logo so wide it would draw diminutive', async () => {
    const cdn = fakeCdn(png())
    await expect(ruled(pair(GOOD_ISO, asset('bbb-4000x400.png')), cdn.impl)).rejects.toThrow(
      /outside the allowed 1.5:1 to 5:1/,
    )
  })

  it('leaves a name carrying no dimensions alone', async () => {
    const cdn = fakeCdn(png())
    // A hand-placed file rather than a Sanity upload. Format still applies;
    // geometry has nothing to read and does not invent a failure.
    const [record] = (await ruled(
      pair(asset('satellite-01-isotipo.webp'), GOOD_LOGO),
      cdn.impl,
    )) as Array<{ isotype: string }>
    expect(record.isotype).toBe('/logos/satellite-01-isotipo.webp')
  })

  it('applies each field its own rule, not the first one it finds', async () => {
    const cdn = fakeCdn(png())
    // 512x512 is a valid isotype and, being square, an invalid logo. If the
    // rules were being looked up by anything other than the field name, this
    // would pass.
    await expect(ruled(pair(GOOD_ISO, asset('bbb-512x512.png')), cdn.impl)).rejects.toThrow(
      /logo: is 512x512 \(1.00:1\), outside the allowed 1.5:1 to 5:1/,
    )
  })
})
