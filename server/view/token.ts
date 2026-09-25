/**
 * Progress tokens: what the browser carries between stages without being able
 * to read it.
 *
 *     stage:u8 | issuedAt:u32 (seconds) | nonce:12B | HMAC-SHA256(key, first 17B) truncated to 16B
 *
 * 33 bytes, 44 characters of base64url. A decoy is 33 random bytes, so a valid
 * token and a miss are the same shape on the wire. That is UX, not security —
 * anyone scripting can test a token against the claim endpoint — and the real
 * bound is the rate limit in front of every verdict.
 *
 * WebCrypto rather than `node:crypto`: it is a global in Node 22 and on Vercel,
 * and it keeps this module importable anywhere the tests run.
 */

export const TOKEN_BYTES = 33
export const TOKEN_LENGTH = 44

/** A token older than this no longer carries progress. Re-issued on every valid use. */
export const TOKEN_MAX_AGE_SECONDS = 48 * 60 * 60

const PAYLOAD_BYTES = 17
const MAC_BYTES = 16

const keys = new Map<string, Promise<CryptoKey>>()

function keyFor(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret)
  if (key === undefined) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    keys.set(secret, key)
  }
  return key
}

async function mac(secret: string, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), data))
}

/** Hex HMAC of a string, for keys that must not store what they are keyed on (an address). */
export async function keyedHash(secret: string, value: string): Promise<string> {
  const bytes = await mac(secret, new TextEncoder().encode('h:' + value))
  return Buffer.from(bytes.subarray(0, 12)).toString('hex')
}

export async function issueToken(secret: string, stage: number, nowMs: number): Promise<string> {
  const bytes = new Uint8Array(TOKEN_BYTES)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, stage)
  view.setUint32(1, Math.floor(nowMs / 1000))
  crypto.getRandomValues(bytes.subarray(5, PAYLOAD_BYTES))
  bytes.set((await mac(secret, bytes.subarray(0, PAYLOAD_BYTES))).subarray(0, MAC_BYTES), PAYLOAD_BYTES)
  return Buffer.from(bytes).toString('base64url')
}

export function decoyToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

/** The stage a token proves, or 0 for anything else — a decoy, a forgery, an expired one. */
export async function verifyToken(secret: string, token: unknown, nowMs: number): Promise<number> {
  if (typeof token !== 'string' || token.length !== TOKEN_LENGTH) return 0
  const bytes = new Uint8Array(Buffer.from(token, 'base64url'))
  if (bytes.length !== TOKEN_BYTES) return 0

  const expected = await mac(secret, bytes.subarray(0, PAYLOAD_BYTES))
  let diff = 0
  for (let i = 0; i < MAC_BYTES; i++) diff |= expected[i] ^ bytes[PAYLOAD_BYTES + i]
  if (diff !== 0) return 0

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const age = Math.floor(nowMs / 1000) - view.getUint32(1)
  if (age < 0 || age > TOKEN_MAX_AGE_SECONDS) return 0
  return view.getUint8(0)
}
