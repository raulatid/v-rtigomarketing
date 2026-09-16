import type { LegalBlock as LegalBlockData } from '../content/types'
import { spans } from './textSpans'

/**
 * The block half of the serializer.
 *
 * An EXPLICIT map from block kind to element, not a rich-text library and not
 * `dangerouslySetInnerHTML`. The inline half — marks and links — moved to
 * `textSpans.tsx` when the blog needed the same rules; the argument for it is
 * recorded there.
 *
 * The switch has no default that renders nothing: a block kind that reached here
 * without a case would be a type error, which is the point of the union.
 */
export function LegalBlock({ block }: { block: LegalBlockData }) {
  if (block.kind === 'heading') {
    // The panel's own title is the h2, so a document heading starts at h3 and
    // the outline stays in order for anyone navigating by headings.
    return block.level === 2 ? <h3>{spans(block.spans)}</h3> : <h4>{spans(block.spans)}</h4>
  }
  if (block.kind === 'list') {
    const items = block.items.map((item, i) => <li key={i}>{spans(item)}</li>)
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
  }
  return <p>{spans(block.spans)}</p>
}

