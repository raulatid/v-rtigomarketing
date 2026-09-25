import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The response headers, asserted — because `vercel.json` cannot carry a comment.
 *
 * PROJECT_MEMORY §11.67 records what happens when someone tries: an unknown key
 * fails the whole deployment. So the reasoning behind every value below has no
 * home in the file it describes, and a policy nobody can read the reasons for is
 * a policy the next person weakens by accident. This file is that home, and it
 * fails rather than merely explaining.
 */
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}

const global = config.headers.find((rule) => rule.source === '/(.*)')
const header = (key: string): string | undefined =>
  global?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value

const csp = header('Content-Security-Policy') ?? ''

/** `script-src 'self' blob:` → the tokens after the name. */
function directive(name: string): string[] {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(name + ' '))
  return found === undefined ? [] : found.split(/\s+/).slice(1)
}

describe('the content security policy', () => {
  it('is ENFORCED, not merely reported', () => {
    // Promoted 2026-09-05 (plan 015 phase 9) after a headless run of the real
    // production build under the enforced policy: the Earth boot, the descent
    // into Murcia, a POST to /api, /blog and a post, with a
    // `securitypolicyviolation` listener installed before the first byte of
    // page script. Zero violations, zero console errors.
    //
    // Report-Only is not kept alongside it. There is no report endpoint, so the
    // only thing a second policy would produce is console noise in a visitor's
    // browser.
    expect(csp).not.toBe('')
    expect(header('Content-Security-Policy-Report-Only')).toBeUndefined()
  })

  it("allows 'unsafe-eval', and this is the note explaining why", () => {
    // THE ONE CONCESSION, and it is not the application's.
    //
    // The KTX2 textures are transcoded by `basis_transcoder.js`, which three.js
    // runs inside a blob: worker. It is an Emscripten build, and embind crafts
    // its invoker functions with `Function(...)` — `craftInvokerFunction`, which
    // is where the stack pointed. A blob: worker inherits the document's policy,
    // so there is no way to grant this only where it is needed without replacing
    // three's worker with a same-origin script of its own.
    //
    // Measured, not assumed: under the policy WITHOUT this token the transcoder
    // throws, the corner logo's textures never arrive, and boot fails —
    // `[boot] fatal — logo:assets: no readiness after 45s`. The same run with it
    // is clean end to end.
    //
    // What it costs is small and bounded here: `src/` contains no eval, no
    // `new Function`, no `innerHTML` fed by anything but numbers and literals,
    // and no inline script survives into `dist/`. The value of `script-src
    // 'self'` — an injected `<script src>` or inline block cannot run — is
    // untouched by it.
    //
    // Drop it the day the transcoder is built with `-sDYNAMIC_EXECUTION=0`.
    // `'wasm-unsafe-eval'` stays either way, which is why both are listed.
    //
    // The one remote origin is gtag.js, appended by src/app/googleAnalytics.ts
    // only after the visitor accepts analytics.
    expect(directive('script-src')).toEqual([
      "'self'",
      "'unsafe-eval'",
      "'wasm-unsafe-eval'",
      'blob:',
      'https://www.googletagmanager.com',
    ])
  })

  it('lets nothing load from an origin the site does not own, except the CMS CDN and Google Analytics', () => {
    expect(directive('default-src')).toEqual(["'self'"])
    // Google Analytics, behind analytics consent (src/app/googleAnalytics.ts).
    // Wildcards because GA4 picks a regional collection host
    // (region1.google-analytics.com, …); these are the hosts Google documents.
    // `blob:` is not an origin: GLTFLoader fetches a GLB's embedded images
    // through blob URLs (ImageBitmapLoader, Chromium), and fetch obeys
    // connect-src, not img-src.
    expect(directive('connect-src')).toEqual([
      "'self'",
      'blob:',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://www.googletagmanager.com',
    ])
    expect(directive('font-src')).toEqual(["'self'"])
    // Blog artwork is served by Sanity. Case-study logos are NOT — they are
    // mirrored into public/logos/ at build time precisely so this line stays
    // short (DECISIONS §27).
    expect(directive('img-src')).toContain('https://cdn.sanity.io')
    // GA's image-beacon fallback, for the same consented vendor.
    expect(directive('img-src')).toContain('https://*.google-analytics.com')
    expect(directive('img-src')).toContain('https://www.googletagmanager.com')
  })

  it('closes the sinks that have no legitimate use here', () => {
    expect(directive('object-src')).toEqual(["'none'"])
    // The background music streams two same-origin <audio> elements
    // (src/app/audio/backgroundMusic.ts, DECISIONS §48). Still 'self' only:
    // MediaCard renders a LINK rather than a <video> or an iframe, deliberately.
    expect(directive('media-src')).toEqual(["'self'"])
    expect(directive('frame-ancestors')).toEqual(["'none'"])
    expect(directive('base-uri')).toEqual(["'self'"])
    expect(directive('form-action')).toEqual(["'self'"])
  })

  it('allows inline STYLE and nothing inline beyond it', () => {
    // index.html carries one generated <style> for the intro. No inline script
    // survives the build, which is what keeps 'unsafe-inline' off script-src.
    expect(directive('style-src')).toEqual(["'self'", "'unsafe-inline'"])
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
  })
})

describe('the headers around it', () => {
  it('keeps the four that do not depend on the policy', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('X-Frame-Options')).toBe('DENY')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('Permissions-Policy')).toContain('camera=()')
  })

  it('does not set HSTS, because Vercel already does', () => {
    // Verified against the platform rather than assumed: a request to a Vercel
    // host answers `Strict-Transport-Security: max-age=63072000;
    // includeSubDomains; preload` even on a 404. Setting our own would be a
    // second source of truth for a header with a two-year memory.
    expect(header('Strict-Transport-Security')).toBeUndefined()
  })

  it('sets no CORS header, because nothing cross-origin asks', () => {
    // The forms POST same-origin to /api. An Access-Control-Allow-Origin here
    // would be permission granted to nobody in particular.
    expect(header('Access-Control-Allow-Origin')).toBeUndefined()
  })
})
