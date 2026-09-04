import { describe, expect, it } from 'vitest'
import { createLimiter, fillTimeVerdict, MIN_FILL_MS, MAX_FILL_MS } from './rateLimit'

/**
 * The cheap controls: how often one sender may submit, and whether the form was
 * filled at human speed.
 *
 * None of this is a security boundary and the module says so out loud. The
 * counters live in one function instance's memory, so a second instance starts
 * at zero, and the start time is a number the client supplies and can therefore
 * lie about. What they buy is that the naive flood — the one that would empty a
 * hundred-a-day Resend quota before lunch — costs more than it returns.
 */

/** A clock the test drives, so nothing here waits on a real hour. */
function clock(start = 1_757_000_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('the sliding windows', () => {
  it('allows up to the cap and refuses the next', () => {
    const limiter = createLimiter({ perIpPerHour: 3, perEmailPerHour: 99, now: clock().now })
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check('1.2.3.4', 'a@example.com').allowed, 'attempt ' + i).toBe(true)
    }
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(false)
  })

  it('counts each address separately from each IP', () => {
    // An office behind one NAT is one IP and many people. The IP cap is the
    // coarse one; the address cap is what stops a single person retrying.
    const limiter = createLimiter({ perIpPerHour: 99, perEmailPerHour: 2, now: clock().now })
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('5.6.7.8', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('9.9.9.9', 'a@example.com').allowed).toBe(false)
    expect(limiter.check('9.9.9.9', 'b@example.com').allowed).toBe(true)
  })

  it('holds one IP to its cap however many addresses it invents', () => {
    const limiter = createLimiter({ perIpPerHour: 2, perEmailPerHour: 99, now: clock().now })
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('1.2.3.4', 'b@example.com').allowed).toBe(true)
    expect(limiter.check('1.2.3.4', 'c@example.com').allowed).toBe(false)
  })

  it('forgets an attempt once its hour has passed', () => {
    const time = clock()
    const limiter = createLimiter({ perIpPerHour: 1, perEmailPerHour: 99, now: time.now })
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(false)
    time.advance(60 * 60 * 1000 + 1)
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
  })

  it('says how long until the window reopens', () => {
    const time = clock()
    const limiter = createLimiter({ perIpPerHour: 1, perEmailPerHour: 99, now: time.now })
    limiter.check('1.2.3.4', 'a@example.com')
    time.advance(15 * 60 * 1000)
    const verdict = limiter.check('1.2.3.4', 'a@example.com')
    expect(verdict.allowed).toBe(false)
    // 45 minutes left of the hour, and a whole number of seconds the client can
    // put in a sentence.
    expect(verdict.retryAfterSeconds).toBe(45 * 60)
    expect(Number.isInteger(verdict.retryAfterSeconds)).toBe(true)
  })

  it('treats an address case-insensitively, because mail servers do', () => {
    const limiter = createLimiter({ perIpPerHour: 99, perEmailPerHour: 1, now: clock().now })
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('5.6.7.8', 'A@Example.COM').allowed).toBe(false)
  })

  it('still counts when the IP is unknown', () => {
    // A request with no forwarded-for header must not become the way past the
    // IP cap. One bucket for all of them is coarse and deliberate.
    const limiter = createLimiter({ perIpPerHour: 1, perEmailPerHour: 99, now: clock().now })
    expect(limiter.check(null, 'a@example.com').allowed).toBe(true)
    expect(limiter.check(null, 'b@example.com').allowed).toBe(false)
  })
})

describe('the memory it is allowed to use', () => {
  it('stays bounded however many distinct senders arrive', () => {
    // Without this the limiter is itself the exhaustion vector: a script with a
    // fresh IP per request would grow the map until the instance died.
    const limiter = createLimiter({
      perIpPerHour: 5,
      perEmailPerHour: 5,
      now: clock().now,
      maxEntries: 100,
    })
    for (let i = 0; i < 5_000; i += 1) {
      limiter.check('10.0.' + Math.floor(i / 256) + '.' + (i % 256), 'user' + i + '@example.com')
    }
    expect(limiter.size()).toBeLessThanOrEqual(100)
  })

  it('keeps counting correctly for a sender it has not evicted', () => {
    const limiter = createLimiter({
      perIpPerHour: 2,
      perEmailPerHour: 99,
      now: clock().now,
      maxEntries: 100,
    })
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(true)
    expect(limiter.check('1.2.3.4', 'a@example.com').allowed).toBe(false)
  })
})

describe('how long the form took to fill', () => {
  const now = 1_757_000_000_000

  it('accepts a form filled at human speed', () => {
    expect(fillTimeVerdict(now - 30_000, now)).toBe('ok')
  })

  it('refuses one filled faster than a person could', () => {
    expect(fillTimeVerdict(now - (MIN_FILL_MS - 1), now)).toBe('too-fast')
    expect(fillTimeVerdict(now, now)).toBe('too-fast')
  })

  it('refuses a start time from the future', () => {
    expect(fillTimeVerdict(now + 60_000, now)).toBe('too-fast')
  })

  it('refuses a panel left open for longer than the cap', () => {
    // Not abuse so much as a stale tab: the person opened the form, went to
    // lunch, and their submission would otherwise carry an hour-old token.
    expect(fillTimeVerdict(now - (MAX_FILL_MS + 1), now)).toBe('stale')
  })

  it('refuses a submission that carries no start time at all', () => {
    // Our own client always sends one. Accepting its absence would make the
    // check bypassable by simply leaving the field out, which is no check.
    expect(fillTimeVerdict(null, now)).toBe('too-fast')
  })
})
