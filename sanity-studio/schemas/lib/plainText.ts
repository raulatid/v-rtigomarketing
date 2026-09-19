import { plainTextProblem, stripHtml } from '../../../content/lib/html'

/**
 * The build's plain-text pass, run at the field before Publicar.
 *
 * Every string the content build accepts goes through `text()` in
 * `content/lib/validate.ts`: strip markup, collapse whitespace, refuse an HTML
 * entity that survived decoding, refuse what is then empty. Sanity's own
 * `required()` stops at `''`, so `'   '` and `&copy; 2026` both publish cleanly
 * here and fail the next deployment — with the failure landing on whoever
 * ships rather than on whoever typed it (the 2026-09-18 pattern).
 *
 * The SAME functions, imported, not re-implemented: `content/lib/html.ts` has
 * no imports, so it is as safe a reach across the package boundary as
 * `editorialBounds.ts`, and a copy of the entity table here would be the drift
 * this whole arrangement exists to avoid.
 */

const ENTITY_MESSAGE =
  'Hay un código HTML como «&nbsp;» o «&copy;». Escribe el carácter directamente (un espacio, ©…) y quita el código.'

/** For a `string` or `text` field. Empty is `required()`'s job; this covers what `required()` lets through. */
export function plainText(value: unknown): true | string {
  if (typeof value !== 'string' || value.length === 0) return true
  const clean = stripHtml(value)
  if (clean.length === 0) return 'Este campo solo tiene espacios. Escribe el texto, o déjalo vacío del todo.'
  if (plainTextProblem(clean) !== null) return ENTITY_MESSAGE
  return true
}

interface RawSpan { text?: unknown }
interface RawBlock { _type?: unknown; children?: unknown }

/** For a rich-text array: the same rule, span by span, as `portableText.ts` applies it. */
export function richText(value: unknown): true | string {
  if (!Array.isArray(value)) return true
  for (const block of value as RawBlock[]) {
    if (block === null || typeof block !== 'object' || block._type !== 'block' || !Array.isArray(block.children)) continue
    for (const child of block.children as RawSpan[]) {
      if (typeof child?.text === 'string' && plainTextProblem(stripHtml(child.text)) !== null) return ENTITY_MESSAGE
    }
  }
  return true
}
