import { BLOG_WORDS_PER_MINUTE } from '../../../src/content/blogPolicy'

/**
 * What the Studio can tell an editor about a legal text before they publish.
 *
 * ── Why these are warnings and not errors ──
 * On 2026-09-18 the three legal documents were rewritten in the Studio with
 * every section title typed as a bold paragraph rather than a «Título» block.
 * Nothing here said a word; the panel rendered it as prose; and the deployment
 * failed on a component test that expected an outline. That is the wrong place
 * for an editorial rule to surface: whoever ships sees it, whoever wrote it
 * does not, and the fix is a content edit either way.
 *
 * So the rule lives here, beside the field, as advice. Advice rather than
 * refusal because neither of these is a broken document — a legal text with no
 * headings reads worse and a very long one reads slower, and both are the
 * editor's call. The one thing the build still refuses is the block cap in
 * `editorialBounds.ts`, which catches a pasted PDF and nothing else.
 *
 * Pure functions over raw Portable Text, so `tests/editorial.test.ts` can run
 * them without a Studio.
 */

/**
 * Past this, the panel is a long scroll and the advice is to break it up.
 * Studio-only, which is why it is not in `editorialBounds.ts`: the build has
 * no opinion on it and must not gain one.
 */
export const LEGAL_WORDS_ADVISED = 3000

interface RawSpan { _type?: unknown; text?: unknown }
interface RawBlock { _type?: unknown; style?: unknown; children?: unknown }

function textBlocks(value: unknown): RawBlock[] {
  if (!Array.isArray(value)) return []
  return value.filter((block): block is RawBlock => block !== null && typeof block === 'object' && (block as RawBlock)._type === 'block')
}

/** Whitespace-separated runs, the same approximation `readingTime.ts` makes. */
export function legalWordCount(value: unknown): number {
  let words = 0
  for (const block of textBlocks(value)) {
    if (!Array.isArray(block.children)) continue
    for (const child of block.children as RawSpan[]) {
      if (typeof child?.text !== 'string') continue
      const trimmed = child.text.trim()
      if (trimmed.length > 0) words += trimmed.split(/\s+/).length
    }
  }
  return words
}

export function legalReadingMinutes(words: number): number {
  return Math.max(1, Math.round(words / BLOG_WORDS_PER_MINUTE))
}

export function legalHasHeading(value: unknown): boolean {
  return textBlocks(value).some((block) => block.style === 'h2' || block.style === 'h3')
}

/** A document with prose but no «Título» block: almost always bold paragraphs standing in for one. */
export function legalHeadingsAdvice(value: unknown): true | string {
  const blocks = textBlocks(value)
  if (blocks.length < 2 || legalHasHeading(value)) return true
  return (
    'Este documento no tiene títulos de sección. Para que un título se vea como tal, ' +
    'pon el cursor en su línea y elige «Título» en el desplegable de estilo (el que dice «Párrafo»); ' +
    'la negrita sola lo deja como un párrafo más. Compruébalo en la pestaña «Vista previa».'
  )
}

export function legalLengthAdvice(value: unknown): true | string {
  const words = legalWordCount(value)
  if (words <= LEGAL_WORDS_ADVISED) return true
  return (
    'Este documento tiene unas ' + words.toLocaleString('es-ES') + ' palabras y se lee en una ventana con scroll. ' +
    'Se publica igual; si puedes, divídelo en secciones con títulos para que sea fácil de recorrer.'
  )
}
