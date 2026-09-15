/**
 * Whether this browser has already watched the Earth intro land (plan 025).
 *
 * A returning visitor still gets the loading draw — it is the loading cover and
 * paces the real load — but not the ~9.7 s scripted tail after it, which covers
 * nothing on a second visit (measured 2026-09-15, plan 025).
 *
 * Stored like the sound preference (`app/audio/backgroundMusic.ts`), for the
 * same reasons: a versioned record read tolerantly, so anything malformed, from
 * another deployment or written by hand is "not seen" rather than a crash; and
 * every access guarded, because Safari's private mode throws on `setItem` and a
 * browser blocking site data throws on the accessor. Unavailable storage means
 * every visit is a first visit, which is the honest outcome.
 *
 * Written only with the visitor's consent (DECISIONS §51). It is storage on the
 * visitor's device, so it waits for «Aceptar» on the consent banner, and a
 * «Rechazar» — then or later — removes it (`clearIntroSeen`). App wires both to
 * `subscribeConsent`. Without consent every visit plays the full intro.
 */
export const INTRO_VERSION = 1
export const INTRO_STORAGE_KEY = 'vertigo:intro'

export function parseIntroRecord(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false
  const { v, seen } = raw as Record<string, unknown>
  return v === INTRO_VERSION && seen === true
}

export function readIntroSeen(): boolean {
  try {
    const raw = window.localStorage.getItem(INTRO_STORAGE_KEY)
    if (raw === null) return false
    return parseIntroRecord(JSON.parse(raw))
  } catch {
    return false
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_STORAGE_KEY, JSON.stringify({ v: INTRO_VERSION, seen: true }))
  } catch {
    // Storage unavailable: the next visit plays the full intro, which is all
    // that was possible.
  }
}

/** Removes the record — what a withdrawn or refused consent asks for. */
export function clearIntroSeen(): void {
  try {
    window.localStorage.removeItem(INTRO_STORAGE_KEY)
  } catch {
    // Storage unavailable: there is nothing stored to remove.
  }
}
