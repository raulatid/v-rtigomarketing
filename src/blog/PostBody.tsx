import type { BlogBlock } from '../content/types'
import { spans } from '../components/textSpans'
import { BlogFigure } from './BlogFigure'
import { MediaCard } from './MediaCard'

/**
 * A post's body, block by block.
 *
 * The same explicit `kind -> element` map `LegalPanel` uses, extended from three
 * kinds to seven. No rich-text library, no `dangerouslySetInnerHTML`: the
 * content build converted Portable Text into this closed vocabulary and FAILED
 * the build on anything outside it, so every value here has already been proved
 * to be what it claims.
 *
 * ── The exhaustiveness assertion at the bottom is the point ──
 *
 * `LegalPanel`'s version falls through to a paragraph, which is right there: its
 * union has three members and a fallback is a reasonable last resort. Here the
 * union has seven and will grow — a `TableBlock` is the obvious next one — and a
 * silent fallthrough would render a table as a paragraph of concatenated cells.
 * `const never: never = block` makes adding a member a TYPE ERROR in this file
 * rather than a defect an editor discovers in production.
 *
 * ── Headings map straight through ──
 *
 * Unlike the legal panel, where the panel itself owns the `<h2>` and document
 * headings shift down to h3/h4. Here the article's own title is the `<h1>`, so a
 * `level: 2` heading is genuinely an `<h2>` and the outline is in order for
 * anyone navigating by headings.
 */
function Block({ block }: { block: BlogBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="blog-body__p">{spans(block.spans)}</p>

    case 'heading':
      return block.level === 2 ? (
        <h2 className="blog-body__h2">{spans(block.spans)}</h2>
      ) : (
        <h3 className="blog-body__h3">{spans(block.spans)}</h3>
      )

    case 'list': {
      const items = block.items.map((item, i) => <li key={i}>{spans(item)}</li>)
      // The artboards draw bullets as an absolutely-positioned <span> dot inside
      // each item. That is a design-tool artifact, not markup to reproduce: a
      // real <ul> gets its marker from CSS and stays a list to a screen reader.
      return block.ordered ? (
        <ol className="blog-body__ol">{items}</ol>
      ) : (
        <ul className="blog-body__ul">{items}</ul>
      )
    }

    case 'quote':
      return <blockquote className="blog-quote">{spans(block.spans)}</blockquote>

    case 'image':
      return <BlogFigure image={block.image} slot="body" />

    case 'video':
      return <MediaCard kind="video" href={block.src} poster={block.poster ?? null} />

    case 'embed':
      return <MediaCard kind={block.provider} href={block.url} poster={null} />
  }

  // Unreachable while the union is fully handled, and a compile error the moment
  // it is not.
  const never: never = block
  return never
}

export function PostBody({ body }: { body: readonly BlogBlock[] }) {
  return (
    <div className="blog-body">
      {body.map((block, i) => (
        // Keyed by index rather than by text: two identical paragraphs are
        // legitimate, and a text key collides. Same reasoning as LegalPanel.
        <Block key={i} block={block} />
      ))}
    </div>
  )
}
