import type { TextSpan } from '../content/types'

/**
 * The inline half of the serializer, shared by the legal panels and the blog.
 *
 * Moved out of `LegalPanel.tsx` when the blog arrived, comment and all, because
 * the reasoning is the load-bearing part:
 *
 * An EXPLICIT map from mark to element, not a rich-text library and not
 * `dangerouslySetInnerHTML`. The content build converts Portable Text into the
 * small vocabulary in `src/content/types.ts` and rejects anything outside it, so
 * every value here has already been proved to be what it claims — including
 * `href`, which ingestion restricted to `https:` and `mailto:` by parsing the
 * URL rather than matching a pattern, and which `invariants.ts` then re-checks
 * on the shipped value.
 *
 * `rel` on every link: these are the only outbound links in the application.
 */
export function spans(items: readonly TextSpan[]) {
  return items.map((span, i) => {
    let node = <>{span.text}</>
    if (span.marks?.includes('em')) node = <em>{node}</em>
    if (span.marks?.includes('strong')) node = <strong>{node}</strong>
    if (span.href !== undefined) {
      node = (
        <a href={span.href} rel="noreferrer">
          {node}
        </a>
      )
    }
    return <span key={i}>{node}</span>
  })
}
