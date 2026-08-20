/**
 * Turning WordPress HTML into plain text.
 *
 * ── Why this exists at all ──
 * WordPress REST returns `title.rendered`, `content.rendered` and
 * `excerpt.rendered` as HTML strings, already expanded with shortcodes and
 * embeds. Every render path in this app is safe *because* the strings reaching
 * it are not markup: `CasePanel` renders JSX text nodes, `districtPanel` builds
 * every node with `textContent`, `createBrandAtlas` draws with `fillText`. That
 * property is worth keeping, and the way to keep it is to strip here — at the
 * mapping layer, once — rather than to sanitize at each render site.
 *
 * ── Prefer not to need it ──
 * The first line of defence is the field model, not this function. ACF
 * text/textarea fields with `show_in_rest` return RAW strings, so a content type
 * built out of ACF fields never goes through here at all. Only core's
 * `title.rendered` and `excerpt.rendered` are unavoidably HTML. Keep the field
 * map biased that way and this stays a fallback.
 *
 * ── Entity decoding is not optional ──
 * WordPress emits `&#8217;`, `&#171;`, `&nbsp;` and friends constantly, and the
 * copy is Spanish. A stripper that removed tags but left entities would render
 * literal `&#171;` in a case-study summary — which is exactly the kind of defect
 * that ships, because it looks like a content mistake rather than a code one.
 */

/**
 * The named entities WordPress actually produces in this content.
 *
 * Deliberately small. A complete HTML5 named-entity table is ~2,200 entries and
 * would be dead weight for a pipeline whose input is Spanish marketing prose;
 * the numeric forms below cover everything else, and `assertPlainText` fails the
 * build on anything that survives. If that assertion starts firing on a real
 * entity, add it here rather than widening the escape hatch.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  deg: '°',
  euro: '€',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
  iquest: '¿',
  iexcl: '¡',
}

/**
 * Decodes numeric and known named entities, once.
 *
 * ONE PASS, deliberately. Decoding repeatedly until the string stops changing is
 * how `&amp;lt;script&amp;gt;` becomes `<script>` — the classic double-decode
 * hole. A single pass means an escaped entity stays escaped, which is the
 * correct reading of the author's intent.
 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      // Lone surrogates and out-of-range code points would produce an unpaired
      // UTF-16 unit that survives JSON but breaks on render.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      if (code >= 0xd800 && code <= 0xdfff) return match
      return String.fromCodePoint(code)
    }
    const named = NAMED_ENTITIES[body]
    return named === undefined ? match : named
  })
}

/**
 * HTML in, plain text out.
 *
 * Regex rather than a DOM parser, and the reason is the threat model rather than
 * convenience: this runs in Node during the build, over content that is about to
 * be written to disk and type-checked. There is no live document, nothing is
 * executed, and the output is asserted plain by `assertPlainText` before it is
 * allowed anywhere near an emitted module. A parser would be more faithful to
 * exotic markup; it would not be safer, and it would add a dependency to a step
 * that currently has none.
 *
 * Block-level tags become a space rather than nothing, so `<p>a</p><p>b</p>`
 * does not become `ab`.
 */
export function stripHtml(input: string): string {
  const spaced = input
    // Script and style bodies are content-bearing to the parser but not to a
    // reader, so their TEXT must go too, not just their tags.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    // Anything still holding a '<' at this point is malformed markup — an
    // unclosed tag, a stray bracket from a bad paste. It cannot be a literal
    // '<' the author typed, because WordPress encodes that as `&lt;` and this
    // runs BEFORE entities are decoded. Dropping it is the only reading that
    // leaves no markup behind.
    .replace(/</g, '')

  // Decode LAST, and this order is the whole design. Decoding first would turn
  // `&lt;script&gt;` into a real tag for the stripper to find and remove, which
  // silently deletes text the author escaped on purpose. Decoding last means an
  // escaped bracket survives as the literal character it was meant to be.
  return collapseWhitespace(decodeEntities(spaced))
}

export function collapseWhitespace(input: string): string {
  // `\s` covers U+00A0, so a decoded `&nbsp;` normalises to an ordinary space
  // rather than travelling into the layout as a character that never wraps.
  return input.replace(/\s+/g, ' ').trim()
}

/**
 * The post-condition, asserted rather than assumed.
 *
 * A guard on the guard, in the style of `checks/architecture.ts` section 5: the
 * mapper's rules all pass trivially if the stripper silently stopped working.
 * This is the assertion that would notice.
 *
 * ── It does NOT reject '<' ──
 * It used to, and that was wrong in a way only a test caught: `&lt;5%` is
 * ordinary Spanish marketing copy, WordPress encodes the bracket, and decoding
 * legitimately produces `<`. Rejecting it would have failed the build on valid
 * content. A literal '<' in a plain string is not a hazard here — every consumer
 * renders through a JSX text node, `textContent` or canvas `fillText`, none of
 * which parse markup. What matters is that no TAG survived, and that is enforced
 * above, before decoding, where the distinction still exists.
 */
export function plainTextProblem(value: string): string | null {
  if (/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/.test(value)) {
    return 'still contains an HTML entity after decoding'
  }
  return null
}
