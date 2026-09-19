import type { HeadingBlock, ListBlock, ParagraphBlock, QuoteBlock, TextMark, TextSpan } from '../../src/content/types'
import { plainTextProblem, stripHtml } from './html'
import { Report } from './validate'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'

/**
 * Portable Text in, typed blocks out — and nothing in between reaches a
 * renderer.
 *
 * ── This is the normalization layer for structured copy ──
 * The same job the GROQ projections do for flat fields. Sanity's own shape —
 * `_type`, `markDefs`, `_key`, flat `listItem` runs — stops here, and what comes
 * out is the small vocabulary `src/content/types.ts` declares. A renderer
 * switching on `kind` never learns Portable Text exists.
 *
 * ── Unknown is a build failure, not a silent drop ──
 * A block style, mark or annotation the policy does not name FAILS. Dropping it
 * would publish a legal document missing a clause an editor believed they had
 * written, which is the worst possible way for this to go wrong. The cost is
 * that widening the vocabulary is a code change; that is the point.
 *
 * ── Lists are flat in Portable Text and nested here ──
 * Sanity emits consecutive sibling blocks each carrying `listItem`, not a list
 * containing items. Runs of them are grouped into one `ListBlock`, because a
 * renderer that emitted one `<ul>` per item would produce a list that reads
 * correctly and announces catastrophically to a screen reader.
 */

export type RichBlock = ParagraphBlock | HeadingBlock | ListBlock | QuoteBlock

export interface BlockPolicy {
  /** Portable Text `style` values that are allowed, e.g. `normal`, `h2`. */
  styles: readonly string[]
  marks: readonly TextMark[]
  allowLinks: boolean
  allowLists: boolean
  maxBlocks: number
  /** Per span. A whole pasted document arriving in one span is the thing to catch. */
  maxTextLength: number
}

/** Everything legal copy may contain, and nothing else. */
export const LEGAL_POLICY: BlockPolicy = {
  styles: ['normal', 'h2', 'h3'],
  marks: ['strong', 'em'],
  allowLinks: true,
  allowLists: true,
  // Shared with the Studio — see src/content/editorialBounds.ts for why it is
  // a net and not a length.
  maxBlocks: EDITORIAL_BOUNDS.legalDoc.bodyBlocks,
  maxTextLength: 2000,
}

/** As above, plus pull quotes. Images and embeds are separate `_type`s. */
export const BLOG_TEXT_POLICY: BlockPolicy = {
  ...LEGAL_POLICY,
  styles: ['normal', 'h2', 'h3', 'blockquote'],
  maxBlocks: 400,
}

/** `https:` for the outside world, `mailto:` for a data-protection contact. */
const ALLOWED_LINK_PROTOCOLS = ['https:', 'mailto:']

export function richBlocks(
  report: Report,
  path: string,
  raw: unknown,
  policy: BlockPolicy,
): RichBlock[] | undefined {
  if (!Array.isArray(raw)) {
    report.fail(path, 'expected an array of blocks, got ' + describe(raw))
    return undefined
  }
  if (raw.length === 0) return report.fail(path, 'must have at least one block')
  if (raw.length > policy.maxBlocks) {
    return report.fail(path, 'has ' + raw.length + ' blocks, over the ' + policy.maxBlocks + ' limit')
  }

  const out: RichBlock[] = []
  let failed = false
  let index = 0

  while (index < raw.length) {
    const at = path + '[' + index + ']'
    const block = asBlock(report, at, raw[index], policy)
    if (block === undefined) {
      failed = true
      index += 1
      continue
    }
    if (block === null) {
      index += 1
      continue
    }

    // A run of sibling list items is ONE list. Grouping here rather than in the
    // renderer is what keeps `<ul>` semantics correct for assistive technology.
    if (block.listItem !== undefined) {
      const ordered = block.listItem === 'number'
      const items: TextSpan[][] = []
      while (index < raw.length) {
        const item = asBlock(report, path + '[' + index + ']', raw[index], policy)
        if (item === null) {
          index += 1
          continue
        }
        if (item === undefined || item.listItem === undefined) break
        if ((item.listItem === 'number') !== ordered) break
        items.push(item.spans)
        index += 1
      }
      if (items.length > 0) out.push({ kind: 'list', ordered, items })
      continue
    }

    index += 1
    if (block.style === 'h2' || block.style === 'h3') {
      out.push({ kind: 'heading', level: block.style === 'h2' ? 2 : 3, spans: block.spans })
    } else if (block.style === 'blockquote') {
      out.push({ kind: 'quote', spans: block.spans })
    } else {
      out.push({ kind: 'paragraph', spans: block.spans })
    }
  }

  if (failed) return undefined
  if (out.length === 0) return report.fail(path, 'has no renderable content')
  return out
}

interface RawBlock {
  style: string
  listItem?: string
  spans: TextSpan[]
}

/**
 * `undefined` is a failure, already reported. `null` is a block with nothing in
 * it — the blank line an editor leaves between paragraphs, or the Enter at the
 * end of a document — which Portable Text stores as a block with one empty
 * span. It carries no clause, so dropping it loses nothing; failing on it
 * (which this did until 2026-09-19) failed a deployment over a keystroke the
 * Studio shows no sign of.
 */
function asBlock(report: Report, at: string, raw: unknown, policy: BlockPolicy): RawBlock | undefined | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return report.fail(at, 'expected a block object, got ' + describe(raw))
  }
  const source = raw as Record<string, unknown>

  // Anything that is not a text block — an image, an embed, a custom object — is
  // this function's caller's problem, and it must say so rather than guess.
  if (source._type !== 'block') {
    return report.fail(at, 'unsupported block type "' + String(source._type) + '"')
  }

  const style = typeof source.style === 'string' && source.style.length > 0 ? source.style : 'normal'
  if (!policy.styles.includes(style)) {
    return report.fail(at, 'unsupported block style "' + style + '"')
  }

  let listItem: string | undefined
  if (source.listItem !== undefined && source.listItem !== null) {
    if (!policy.allowLists) return report.fail(at, 'lists are not allowed here')
    if (source.listItem !== 'bullet' && source.listItem !== 'number') {
      return report.fail(at, 'unsupported list type "' + String(source.listItem) + '"')
    }
    listItem = source.listItem
  }

  const links = linkTargets(report, at, source.markDefs, policy)
  if (links === undefined) return undefined

  const spans = readSpans(report, at, source.children, policy, links)
  if (spans === undefined) return undefined
  if (spans.length === 0) return null

  return { style, listItem, spans }
}

/**
 * `markDefs` are the block's annotations, referenced from a span's `marks` by
 * `_key`. Resolving them here means a span carries a plain `href` and the
 * renderer never chases a reference.
 */
function linkTargets(
  report: Report,
  at: string,
  raw: unknown,
  policy: BlockPolicy,
): Map<string, string> | undefined {
  const targets = new Map<string, string>()
  if (raw === undefined || raw === null) return targets
  if (!Array.isArray(raw)) return report.fail(at + '.markDefs', 'expected an array')

  for (const [i, def] of raw.entries()) {
    const where = at + '.markDefs[' + i + ']'
    if (def === null || typeof def !== 'object') return report.fail(where, 'expected an object')
    const shaped = def as Record<string, unknown>
    if (shaped._type !== 'link') {
      return report.fail(where, 'unsupported annotation "' + String(shaped._type) + '"')
    }
    if (!policy.allowLinks) return report.fail(where, 'links are not allowed here')
    if (typeof shaped._key !== 'string' || shaped._key.length === 0) {
      return report.fail(where, 'has no _key, so no span can reference it')
    }
    const href = safeHref(report, where, shaped.href)
    if (href === undefined) return undefined
    targets.set(shaped._key, href)
  }
  return targets
}

/**
 * The link allowlist, applied at INGEST so the renderer can emit `href` without
 * asking questions. `javascript:` and `data:` are the reason this exists; the
 * URL is parsed rather than pattern-matched, because a parser is immune to the
 * backslash, tab and percent-encoding variants a pattern is not.
 */
function safeHref(report: Report, at: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return report.fail(at + '.href', 'a link needs a destination')
  }
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return report.fail(at + '.href', '"' + value + '" is not an absolute URL')
  }
  if (!ALLOWED_LINK_PROTOCOLS.includes(url.protocol)) {
    return report.fail(
      at + '.href',
      url.protocol + ' links are not allowed — use ' + ALLOWED_LINK_PROTOCOLS.join(' or '),
    )
  }
  return url.toString()
}

function readSpans(
  report: Report,
  at: string,
  raw: unknown,
  policy: BlockPolicy,
  links: Map<string, string>,
): TextSpan[] | undefined {
  if (!Array.isArray(raw)) return report.fail(at + '.children', 'expected an array of spans')

  const spans: TextSpan[] = []
  for (const [i, child] of raw.entries()) {
    const where = at + '.children[' + i + ']'
    if (child === null || typeof child !== 'object') return report.fail(where, 'expected an object')
    const shaped = child as Record<string, unknown>
    if (shaped._type !== undefined && shaped._type !== 'span') {
      return report.fail(where, 'unsupported inline type "' + String(shaped._type) + '"')
    }
    if (typeof shaped.text !== 'string') return report.fail(where + '.text', 'expected a string')

    // The same defensive pass every plain text field gets. Sanity stores text,
    // not markup, so a tag arriving here means someone pasted rendered HTML —
    // and it must not survive into a component either way.
    const original = shaped.text
    const collapsed = stripHtml(original)
    const residue = plainTextProblem(collapsed)
    if (residue !== null) return report.fail(where + '.text', residue)

    // `stripHtml` TRIMS, and a span's boundary whitespace is load-bearing here.
    // Portable Text splits a sentence at every mark boundary, so "escribe a "
    // and "hola@example.com" are two spans and the trailing space is the only
    // thing keeping them apart. Trimming it renders "escribe ahola@example.com".
    const lead = collapsed.length > 0 && /^\s/.test(original) ? ' ' : ''
    const trail = collapsed.length > 0 && /\s$/.test(original) ? ' ' : ''
    const text =
      collapsed.length > 0 ? lead + collapsed + trail : /\s/.test(original) ? ' ' : ''

    if (text.length > policy.maxTextLength) {
      return report.fail(where + '.text', 'is ' + text.length + ' chars, over the ' + policy.maxTextLength + ' limit')
    }
    // A truly empty span carries nothing. A whitespace-only one is how Portable
    // Text represents a gap between two marked runs, and became ' ' above.
    if (text.length === 0) continue

    const span: TextSpan = { text }
    const marks = shaped.marks
    if (marks !== undefined && marks !== null) {
      if (!Array.isArray(marks)) return report.fail(where + '.marks', 'expected an array')
      const applied: TextMark[] = []
      for (const mark of marks) {
        if (typeof mark !== 'string') return report.fail(where + '.marks', 'expected strings')
        if (links.has(mark)) {
          span.href = links.get(mark)
          continue
        }
        if (!policy.marks.includes(mark as TextMark)) {
          return report.fail(where + '.marks', 'unsupported mark "' + mark + '"')
        }
        applied.push(mark as TextMark)
      }
      if (applied.length > 0) span.marks = applied
    }
    spans.push(span)
  }
  return spans
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
