/**
 * Whether this browser has landed here before, decided in the boot entry.
 *
 * The drawing starts before the app exists, and a returning visitor must never
 * see it start — so the question has to be answered HERE, not where the rest of
 * the consent code lives. The app then reads this answer off
 * `window.__vertigoIntro` rather than asking again, for the reason
 * `reducedMotion` travels the same way: one snapshot per document, so the
 * drawing and the timeline cannot disagree about which visit this is.
 *
 * ── A second reader of two records that have an owner each ──
 *
 * `app/consent.ts` owns `vertigo:consent` and `app/introSeen.ts` owns
 * `vertigo:intro`. This module cannot import either: the boot entry ships ahead
 * of the app and must not pull a shared chunk in with it (see `boot.ts`). So the
 * two shapes are restated here, read-only, and `returningVisitor.test.ts` holds
 * this reader to the owners' answers on the same inputs — bump a version there
 * and that test fails until this follows.
 *
 * Tolerant like both owners: anything malformed, from another deployment, or a
 * storage that throws on access is a FIRST visit, which is the honest outcome.
 */

const CONSENT_KEY = 'vertigo:consent'
const CONSENT_VERSION = 3
const INTRO_KEY = 'vertigo:intro'
const INTRO_VERSION = 1

function record(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
}

export function isReturningVisitor(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const consent = record(storage.getItem(CONSENT_KEY))
    if (
      consent === null ||
      consent.v !== CONSENT_VERSION ||
      consent.preferences !== true ||
      typeof consent.analytics !== 'boolean' ||
      typeof consent.at !== 'string'
    ) {
      return false
    }
    const intro = record(storage.getItem(INTRO_KEY))
    return intro !== null && intro.v === INTRO_VERSION && intro.seen === true
  } catch {
    return false
  }
}
