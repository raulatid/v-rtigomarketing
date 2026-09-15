/**
 * The visitor's cookie choice: one record, read tolerantly, shared by signal.
 *
 * ── What it gates ──
 *
 * Experience preferences gate the intro memory independently of analytics.
 * Analytics is not installed: when integrated, update the policy and consent
 * version and gate both loading AND withdrawal on this module. Never load a
 * vendor from an old prospective choice alone. The sound toggle remembers an
 * explicitly requested setting separately; it does not enable analytics.
 *
 * ── Why localStorage and not a cookie ──
 *
 * No server reads it: `/api/contact` and `/api/audit` receive form posts and
 * nothing else, so a cookie would ride every request for nobody. A cookie also
 * needs an expiry and a renewal; a stored record needs neither.
 *
 * ── Versioned, and read like history.state ──
 *
 * `CONSENT_VERSION` is what the record must carry to count. Bumping it makes
 * every stored choice read as absent, which is how the visitor is asked again
 * when what the banner asks for changes. Every field is checked rather than
 * trusted (the `readBlogState` argument): a record written by an older
 * deployment, by hand, or by another origin's script degrades to "not asked
 * yet", never to a crash.
 *
 * ── When storage is unavailable ──
 *
 * Safari's private mode throws on `setItem`; a browser configured to block site
 * data throws on the accessor itself. The choice then lives in memory for the
 * session — the visitor is not asked twice in one visit — and is asked again
 * next time, which is the honest outcome when nothing could be kept.
 *
 * Module-level state shared by signal, the cursorSignal shape: the two copies
 * of the banner (scene and blog) and any future loader subscribe, and a late
 * subscriber is called back at once with what is already known.
 */

export type ConsentCategory = 'preferences' | 'analytics'

export const CONSENT_VERSION = 2
export const CONSENT_STORAGE_KEY = 'vertigo:consent'

export interface ConsentRecord {
  v: number
  analytics: boolean
  preferences: boolean
  /** ISO timestamp of the choice. */
  at: string
}

type Listener = (record: ConsentRecord | null) => void

let current: ConsentRecord | null | undefined
const listeners = new Set<Listener>()

function parse(raw: unknown): ConsentRecord | null {
  if (raw === null || typeof raw !== 'object') return null
  const { v, analytics, preferences, at } = raw as Record<string, unknown>
  if (v !== CONSENT_VERSION) return null
  if (typeof analytics !== 'boolean') return null
  if (typeof preferences !== 'boolean') return null
  if (typeof at !== 'string') return null
  return { v, analytics, preferences, at }
}

function load(): ConsentRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (raw === null) return null
    return parse(JSON.parse(raw))
  } catch {
    return null
  }
}

function persist(record: ConsentRecord) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Kept in memory only — see the header. Nothing to report: the next visit
    // asks again, which is the visible consequence.
  }
}

/** The stored choice, or null when there is none worth honouring. */
export function readConsent(): ConsentRecord | null {
  if (current === undefined) {
    current = load()
    clearWithdrawnPreferences(current)
  }
  return current
}

/** Records the choice, persists what it can, and tells every subscriber. */
export function writeConsent(choices: Record<ConsentCategory, boolean>): ConsentRecord {
  const record: ConsentRecord = {
    v: CONSENT_VERSION,
    analytics: choices.analytics,
    preferences: choices.preferences,
    at: new Date().toISOString(),
  }
  persist(record)
  current = record
  clearWithdrawnPreferences(record)
  for (const listener of listeners) listener(record)
  return record
}

/** Remove only storage owned by optional experience preferences, including
 * when consent is withdrawn from the standalone blog or another tab. */
function clearWithdrawnPreferences(record: ConsentRecord | null) {
  if (record?.preferences || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('vertigo:intro')
  } catch { /* Storage may be blocked. */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== CONSENT_STORAGE_KEY && event.key !== null) return
    current = load()
    clearWithdrawnPreferences(current)
    for (const listener of listeners) listener(current)
  })
}

/** The gate a vendor loader asks. False until the visitor has said yes. */
export function hasConsent(category: ConsentCategory): boolean {
  const record = readConsent()
  return record !== null && record[category]
}

/** Calls back immediately with the current record, then on every write. */
export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener)
  listener(readConsent())
  return () => {
    listeners.delete(listener)
  }
}
