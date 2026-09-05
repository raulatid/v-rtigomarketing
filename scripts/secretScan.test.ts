import { describe, expect, it } from 'vitest'
import { findSecretLeaks, isSecretName, publicPrefixedSecrets, scannableSecrets } from './secretScan'

describe('what counts as a credential', () => {
  it('names the credentials this repository actually holds', () => {
    expect(isSecretName('SANITY_TOKEN')).toBe(true)
    expect(isSecretName('RESEND_API_KEY')).toBe(true)
  })

  it('recognises the shape of one it has not met', () => {
    expect(isSecretName('STRIPE_SECRET')).toBe(true)
    expect(isSecretName('DB_PASSWORD')).toBe(true)
    expect(isSecretName('DEPLOY_PRIVATE_KEY')).toBe(true)
  })

  it('leaves ordinary settings alone', () => {
    for (const name of ['SANITY_PROJECT_ID', 'SANITY_DATASET', 'MAIL_FROM', 'VERCEL_ENV', 'CONTENT_SOURCE']) {
      expect(isSecretName(name), name).toBe(false)
    }
  })
})

describe('the VITE_ prefix', () => {
  it('refuses a credential that would be compiled into the client bundle', () => {
    expect(publicPrefixedSecrets({ VITE_SANITY_TOKEN: 'x' })).toEqual(['VITE_SANITY_TOKEN'])
  })

  it('allows the prefix on a value that is genuinely public', () => {
    expect(publicPrefixedSecrets({ VITE_VERCEL_ENV: 'production' })).toEqual([])
  })

  it('ignores an unprefixed credential, which is where one belongs', () => {
    expect(publicPrefixedSecrets({ SANITY_TOKEN: 'x' })).toEqual([])
  })
})

describe('the values worth scanning for', () => {
  it('skips one too short to be anything but a placeholder', () => {
    expect(scannableSecrets({ SANITY_TOKEN: 'x' })).toEqual([])
  })

  it('skips an unset or blank variable', () => {
    expect(scannableSecrets({ SANITY_TOKEN: undefined, RESEND_API_KEY: '   ' })).toEqual([])
  })

  it('carries a real one, trimmed', () => {
    expect(scannableSecrets({ SANITY_TOKEN: ' sk_abcdefghijklmnop ' })).toEqual([
      { name: 'SANITY_TOKEN', value: 'sk_abcdefghijklmnop' },
    ])
  })
})

describe('scanning emitted output', () => {
  const secrets = [{ name: 'RESEND_API_KEY', value: 're_abcdefghijklmnop' }]

  it('is quiet on a clean bundle', () => {
    expect(findSecretLeaks([{ name: 'index.js', text: 'const a=1' }], secrets)).toEqual([])
  })

  it('finds a value that reached a chunk, and names the file without reprinting it', () => {
    const leaks = findSecretLeaks(
      [{ name: 'assets/index-abc.js', text: 'const k="re_abcdefghijklmnop"' }],
      secrets,
    )
    expect(leaks).toEqual([{ name: 'RESEND_API_KEY', file: 'assets/index-abc.js' }])
    expect(JSON.stringify(leaks)).not.toContain('re_abcdefghijklmnop')
  })

  it('finds one embedded in a larger string, which is how a serialized env leaks', () => {
    const leaks = findSecretLeaks(
      [{ name: 'index.html', text: '<script>window.e={"RESEND_API_KEY":"re_abcdefghijklmnop"}</script>' }],
      secrets,
    )
    expect(leaks).toHaveLength(1)
  })
})
