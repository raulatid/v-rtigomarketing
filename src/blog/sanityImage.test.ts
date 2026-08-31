import { describe, expect, it } from 'vitest'
import type { ImageMedia } from '../content/types'
import { SIZES, ogImageUrl, sanityImageSrc, sanityImageSrcSet } from './sanityImage'

const cdn = (over: Partial<ImageMedia> = {}): ImageMedia => ({
  src: 'https://cdn.sanity.io/images/qxpcrdaw/development/abc123-1600x900.jpg',
  alt: 'una imagen',
  width: 1600,
  height: 900,
  ...over,
})

const widthsIn = (srcset: string): number[] =>
  srcset.split(', ').map((entry) => Number(entry.split(' ')[1].replace('w', '')))

describe('sanityImageSrc', () => {
  it('adds transforms through searchParams', () => {
    const url = new URL(sanityImageSrc(cdn(), 680, 'body'))
    expect(url.origin).toBe('https://cdn.sanity.io')
    expect(url.searchParams.get('w')).toBe('680')
    expect(url.searchParams.get('fit')).toBe('max')
    expect(url.searchParams.get('auto')).toBe('format')
    expect(url.searchParams.get('q')).toBe('78')
  })

  it('replaces an existing parameter rather than appending a second one', () => {
    // The failure string concatenation makes: `...?w=100?w=680`, or `&w=` twice.
    const src = sanityImageSrc(cdn({ src: cdn().src + '?w=100' }), 680, 'body')
    expect(src.match(/[?&]w=/g)).toHaveLength(1)
    expect(new URL(src).searchParams.get('w')).toBe('680')
  })

  it('varies quality by slot', () => {
    expect(new URL(sanityImageSrc(cdn(), 400, 'card')).searchParams.get('q')).toBe('72')
    expect(new URL(sanityImageSrc(cdn(), 680, 'cover')).searchParams.get('q')).toBe('80')
  })
})

describe('origin guard', () => {
  it('leaves a local path completely alone', () => {
    // ImageMedia.src is documented as a CDN url OR a local path. Appending
    // `?w=680` to `/og-default.png` would be nonsense rather than an error.
    const local = cdn({ src: '/og-default.png', width: 1200, height: 630 })
    expect(sanityImageSrc(local, 680, 'body')).toBe('/og-default.png')
    expect(sanityImageSrcSet(local, 'body')).toBeUndefined()
  })

  it('refuses any origin that is not the Sanity CDN', () => {
    // Parsed, never prefix-matched. SEC-1 in the security audit is this mistake
    // made once already: `startsWith` guards are bypassable because the URL
    // parser treats a backslash as a slash.
    for (const src of [
      'https://cdn.sanity.io.evil.example/x-800x600.jpg',
      'https://evil.example/cdn.sanity.io/x-800x600.jpg',
      'https://cdn.sanity.io@evil.example/x-800x600.jpg',
      'http://cdn.sanity.io/x-800x600.jpg',
      'https://cdn.sanity.io:8443/x-800x600.jpg',
    ]) {
      const image = cdn({ src })
      expect(sanityImageSrc(image, 680, 'body'), src).toBe(src)
      expect(sanityImageSrcSet(image, 'body'), src).toBeUndefined()
    }
  })

  it('accepts the real CDN origin', () => {
    expect(sanityImageSrc(cdn(), 680, 'body')).not.toBe(cdn().src)
  })
})

describe('sanityImageSrcSet', () => {
  it('offers every rung the asset can actually fill', () => {
    expect(widthsIn(sanityImageSrcSet(cdn(), 'body') as string)).toEqual([400, 680, 960, 1360])
  })

  it('never offers a width the asset does not have', () => {
    // Sanity honours a larger `w` by STRETCHING, so an unfiltered ladder would
    // hand a big screen an upscaled image and call it the best candidate.
    expect(widthsIn(sanityImageSrcSet(cdn({ width: 1000 }), 'body') as string)).toEqual([400, 680, 960])
    expect(widthsIn(sanityImageSrcSet(cdn({ width: 700 }), 'body') as string)).toEqual([400, 680])
  })

  it('omits the srcset entirely for an image narrower than every rung', () => {
    expect(sanityImageSrcSet(cdn({ width: 320 }), 'card')).toBeUndefined()
  })

  it('emits no duplicate widths', () => {
    const widths = widthsIn(sanityImageSrcSet(cdn(), 'card') as string)
    expect(new Set(widths).size).toBe(widths.length)
  })

  it('pairs each candidate with its own width descriptor', () => {
    for (const entry of (sanityImageSrcSet(cdn(), 'body') as string).split(', ')) {
      const [url, descriptor] = entry.split(' ')
      expect(new URL(url).searchParams.get('w')).toBe(descriptor.replace('w', ''))
    }
  })
})

describe('SIZES', () => {
  it('names a width for every slot', () => {
    expect(Object.keys(SIZES).sort()).toEqual(['body', 'card', 'cover', 'featured'])
    for (const [slot, value] of Object.entries(SIZES)) {
      expect(value, slot).toMatch(/100vw/)
    }
  })
})

describe('ogImageUrl', () => {
  const ORIGIN = 'https://vertigo.example'

  it('is absolute, fixed-size and fixed-format', () => {
    // A scraper is not a browser: no useful Accept header, no srcset, and no
    // document base to resolve a relative url against.
    const url = new URL(ogImageUrl(cdn(), ORIGIN))
    expect(url.searchParams.get('w')).toBe('1200')
    expect(url.searchParams.get('h')).toBe('630')
    expect(url.searchParams.get('fit')).toBe('crop')
    expect(url.searchParams.get('fm')).toBe('jpg')
    expect(url.searchParams.get('auto')).toBeNull()
  })

  it('makes the local default absolute', () => {
    const local = cdn({ src: '/og-default.png', width: 1200, height: 630 })
    expect(ogImageUrl(local, ORIGIN)).toBe('https://vertigo.example/og-default.png')
  })

  it('always returns something a scraper can fetch', () => {
    for (const image of [cdn(), cdn({ src: '/og-default.png' })]) {
      expect(ogImageUrl(image, ORIGIN)).toMatch(/^https:\/\//)
    }
  })
})
