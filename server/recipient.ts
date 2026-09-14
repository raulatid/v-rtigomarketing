/**
 * Where a notification goes, and one of the two edges from the server tier into
 * `src/` — both through `src/content/site.ts`.
 *
 * ── Why the address comes from the CMS ──
 *
 * `siteSettings.contactEmail` is described to the editor as "La dirección a la
 * que llegan los mensajes", and it has been sitting there unused since the
 * content pipeline was built — `src/content/site.ts` exported `CONTACT_EMAIL`
 * and nothing but its own test ever read it. This is its first real consumer,
 * and it means the client can change where their enquiries land without a
 * developer.
 *
 * ── The latency, stated where somebody will read it ──
 *
 * Content is generated at BUILD time (adr/010), so `src/content/generated/` is
 * a build artifact — gitignored, written by `npm run content:build`, which runs
 * ahead of every build through `precheck`/`pree2e`. Two consequences worth
 * knowing:
 *
 *   - changing the address in Sanity does nothing until the site is rebuilt and
 *     redeployed. That is a real delay, it is documented for the editor in
 *     `sanity-studio/GUIA-EDITOR.md`, and it is the price of having no runtime
 *     CMS request on a site whose whole architecture avoids one;
 *   - this module and `validate.ts` (the audit form's billing ranges, since
 *     2026-09-14) are the only things in `server/` that reach into `src/`, and
 *     both through the one content adapter, so the dependency stays narrow
 *     rather than becoming a habit.
 */

import { CONTACT_EMAIL } from '../src/content/site'

/** The same deliberately-loose shape the rest of the repository uses. */
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type RecipientResult = { ok: true; to: string } | { ok: false; message: string }

export function readRecipient(raw: string): RecipientResult {
  const to = raw.trim()
  if (!ADDRESS_PATTERN.test(to)) {
    return {
      ok: false,
      message:
        'the published contact address is not usable ("' +
        to +
        '") — fix `contactEmail` in Sanity (Ajustes del sitio) and rebuild.',
    }
  }
  return { ok: true, to }
}

/**
 * Throws rather than returning a fallback. There is no sane default for "who
 * receives this company's enquiries", and a guessed one silently sends somebody
 * else's leads into a void.
 */
export function cmsRecipient(): string {
  const result = readRecipient(CONTACT_EMAIL)
  if (!result.ok) throw new Error(result.message)
  return result.to
}
