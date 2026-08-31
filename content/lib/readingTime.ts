/**
 * How long a post takes to read, in minutes, derived from its body.
 *
 * COMPUTED, NEVER AUTHORED. The alternative was a number in the Studio, and the
 * argument against it is the one `src/content/types.ts` already makes about
 * `aspectRatio` and `dominantColor`: a value an editor sets once and the content
 * then drifts away from is worse than no value, because nothing ever reports the
 * drift. Editing a paragraph should change the estimate, and only a derivation
 * does that.
 *
 * DETERMINISTIC, which is not incidental. `content/lib/emit.ts` is built around
 * byte-identical output for unchanged content, so anything that reached for a
 * clock, a locale or a random tiebreak would make every build a diff.
 *
 * Words per minute is a convention, not a measurement. The honest claim a
 * "4 min de lectura" label makes to a reader is "this is short", and the figure
 * is calibrated to make that claim land rather than to predict a stopwatch.
 */
import type { BlogBlock, TextSpan } from '../../src/content/types'
import { BLOG_READING_MINUTES_MIN, BLOG_WORDS_PER_MINUTE } from '../../src/content/blogPolicy'

/**
 * Whitespace-separated runs, which is close enough and stays honest about being
 * an approximation. A real tokenizer would count "e-commerce" as two words and
 * "3.000" as one, and no reader would be able to tell the difference in the
 * rounded result.
 */
function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/\s+/).length
}

function spanWords(spans: readonly TextSpan[]): number {
  let total = 0
  for (const span of spans) total += countWords(span.text)
  return total
}

/**
 * Media contributes nothing.
 *
 * An image, a video card or an embed takes a reader some time, but not time this
 * function can estimate — and inventing a per-image constant would make the
 * number look more precise while making it less true. Counted prose only.
 */
export function readingMinutes(body: readonly BlogBlock[]): number {
  let words = 0
  for (const block of body) {
    if (block.kind === 'list') {
      for (const item of block.items) words += spanWords(item)
      continue
    }
    if (block.kind === 'paragraph' || block.kind === 'heading' || block.kind === 'quote') {
      words += spanWords(block.spans)
    }
  }
  return Math.max(BLOG_READING_MINUTES_MIN, Math.round(words / BLOG_WORDS_PER_MINUTE))
}
