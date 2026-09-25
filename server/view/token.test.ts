import { describe, expect, it } from 'vitest'
import { decoyToken, issueToken, TOKEN_LENGTH, TOKEN_MAX_AGE_SECONDS, verifyToken } from './token'

const SECRET = 's'.repeat(40)
const NOW = 1_790_000_000_000

describe('progress tokens', () => {
  it('round-trips the stage it was issued for', async () => {
    const token = await issueToken(SECRET, 3, NOW)
    expect(await verifyToken(SECRET, token, NOW + 1000)).toBe(3)
  })

  it('is the same length as a decoy, and a decoy proves nothing', async () => {
    const token = await issueToken(SECRET, 1, NOW)
    const decoy = decoyToken()
    expect(token).toHaveLength(TOKEN_LENGTH)
    expect(decoy).toHaveLength(TOKEN_LENGTH)
    expect(await verifyToken(SECRET, decoy, NOW)).toBe(0)
  })

  it('refuses a token signed with another key', async () => {
    const token = await issueToken('o'.repeat(40), 1, NOW)
    expect(await verifyToken(SECRET, token, NOW)).toBe(0)
  })

  it('refuses a token whose stage byte was edited', async () => {
    const token = await issueToken(SECRET, 1, NOW)
    const bytes = Buffer.from(token, 'base64url')
    bytes[0] = 2
    expect(await verifyToken(SECRET, bytes.toString('base64url'), NOW)).toBe(0)
  })

  it('expires', async () => {
    const token = await issueToken(SECRET, 1, NOW)
    expect(await verifyToken(SECRET, token, NOW + TOKEN_MAX_AGE_SECONDS * 1000)).toBe(1)
    expect(await verifyToken(SECRET, token, NOW + (TOKEN_MAX_AGE_SECONDS + 1) * 1000)).toBe(0)
  })

  it.each([undefined, null, 42, '', 'x'.repeat(TOKEN_LENGTH), 'x'.repeat(TOKEN_LENGTH + 1)])(
    'refuses %p',
    async (value) => {
      expect(await verifyToken(SECRET, value, NOW)).toBe(0)
    },
  )
})
