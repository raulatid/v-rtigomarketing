import type { SlugRule, SlugValue } from 'sanity'
import { ID_MAX_LENGTH, ID_PATTERN } from '../../../src/content/editorialBounds'

/**
 * The identifier contract, enforced at the field instead of at the deploy.
 *
 * ── The hole this closes ──
 * `src/content/invariants.ts` validates every identifier against
 * `/^[a-z0-9][a-z0-9-]{0,63}$/` and `content:build` fails the build when one
 * does not match. The Studio's slug fields were `required()` and length-capped
 * and nothing more, so the two ends disagreed about a case an editor reaches by
 * doing the ordinary thing: Sanity's stock slugify lowercases and replaces
 * spaces, but it does NOT strip accents. "Análisis Web" became `análisis-web`,
 * which the Studio published happily and the next deploy rejected — an error
 * with no field attached, on a machine the editor cannot see, minutes after
 * they had moved on. P1-A in the 2026-08-27 architecture audit.
 *
 * ── The pattern is imported now, and used to be copied ──
 * This package is deliberately outside the application's dependency graph (see
 * the note at the top of `tsconfig.json`), and for a while that meant the
 * pattern was duplicated here character for character with a comment asking the
 * next person to keep the two in step. `src/content/editorialBounds.ts` is the
 * one module that separation now permits: a leaf with no imports of its own,
 * holding the bounds and the identifier contract both sides enforce. Verified
 * against both `sanity build` and `sanity dev` — see the note at the top of it.
 *
 * ── Two layers, because they fail differently ──
 * `slugify` makes the generated value correct — the path an editor actually
 * takes, pressing "Generar". `slugValidation` makes an incorrect value
 * unpublishable — the path where someone types into the field by hand, or
 * where a value predates this file. Neither alone closes the hole.
 */

/**
 * Re-exported under this package's own name: `slugOptions` and the messages
 * below read better with it, and Sanity's own `maxLength` option is what the
 * next person will look for.
 */
export const SLUG_MAX_LENGTH = ID_MAX_LENGTH

/**
 * Title → identifier, for Spanish editorial titles.
 *
 * Sanity's default would be enough for `analisis-web`; it is the accented
 * majority of real titles it gets wrong. The steps, in the order they have to
 * happen:
 *
 *   "Análisis Web & SEO"
 *     NFD          → "Ana" + combining acute + "lisis Web & SEO"
 *     strip marks  → "Analisis Web & SEO"     (ñ → n, ü → u, ç → c)
 *     lowercase    → "analisis web & seo"
 *     separate     → "analisis-web-seo"
 *
 * Every run of characters outside the contract collapses to ONE hyphen rather
 * than being deleted, so "SEO & SEM" reads as `seo-sem` and not `seosem`.
 * Trailing hyphens are trimmed twice on purpose: once after the substitution,
 * and again after the length cut, which can itself land on a separator.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '')
}

/**
 * The `options` block every slug field shares. `source` is the only thing that
 * differs between the five documents.
 *
 * `maxLength` is passed as well as enforced inside `slugify`. It is not
 * redundant to a reader: it is the declaration of the bound, in the place
 * Sanity documents it, where the next person will look for it.
 */
export function slugOptions(source: string) {
  return { source, maxLength: SLUG_MAX_LENGTH, slugify }
}

/**
 * Messages are the editor's, not the build's. "No coincide con
 * ^[a-z0-9][a-z0-9-]{0,63}$" is true and useless; what someone needs is the
 * button that fixes it.
 */
function checkSlug(value: SlugValue | undefined): true | string {
  const current = value?.current
  // Emptiness belongs to `required()`, which owns its own message.
  if (typeof current !== 'string' || current.length === 0) return true

  if (current.length > SLUG_MAX_LENGTH) {
    return (
      `Demasiado largo: ${current.length} caracteres, el máximo es ${SLUG_MAX_LENGTH}. ` +
      'Acorta el título y vuelve a pulsar "Generar".'
    )
  }

  if (!ID_PATTERN.test(current)) {
    return (
      'Solo se permiten minúsculas sin acentos, números y guiones, y debe empezar por ' +
      'una letra o un número. Pulsa "Generar" para crearlo a partir del título.'
    )
  }

  return true
}

/**
 * `required()` plus the contract, as two rules rather than one chain.
 *
 * Sanity's `.error(message)` applies to the whole chain it is called on, so
 * `rule.required().error('Pulsa "Generar"…').custom(checkSlug)` would answer a
 * malformed slug with the message for a missing one. An array keeps each
 * message on the rule that produced it.
 *
 * `requiredMessage` is optional because three of the five fields already carry
 * a hand-written one and two deliberately do not.
 */
export function slugValidation(rule: SlugRule, requiredMessage?: string): SlugRule[] {
  const required = requiredMessage ? rule.required().error(requiredMessage) : rule.required()
  return [required, rule.custom(checkSlug)]
}
