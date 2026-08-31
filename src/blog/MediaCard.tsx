import type { ImageMedia } from '../content/types'

interface Props {
  kind: 'video' | 'youtube' | 'vimeo'
  href: string
  poster: ImageMedia | null
}

const LABEL: Record<Props['kind'], string> = {
  video: 'Vídeo',
  youtube: 'Vídeo en YouTube',
  vimeo: 'Vídeo en Vimeo',
}

/**
 * Video and embeds, rendered as a LINK rather than a player.
 *
 * ── Why this is not an iframe ──
 *
 * `src/content/types.ts` says it plainly about `VideoBlock`: "There is no
 * transcoding pipeline and no player, and this migration is not the place to add
 * either. What it IS the place for is the schema boundary." The same holds for
 * the renderer. A link card is the honest render of a boundary that exists so an
 * editor is not blocked later — not a feature pretending to be finished.
 *
 * ── What that buys, concretely ──
 *
 * `frame-src` stays absent from the CSP and `media-src` stays `'none'`. No
 * third-party script, no YouTube cookie set on a reader who only scrolled past,
 * no 1 MB player, and no layout shift. Widening a Content-Security-Policy is a
 * decision that should be made when something needs it, and today nothing does:
 * no fixture and none of the three approved artboards contains a video.
 *
 * ── When a player is wanted ──
 *
 * It must be a click-to-load FACADE — poster plus a play button that swaps in an
 * iframe on click — never a bare iframe, and the same commit must add
 * `frame-src https://www.youtube-nocookie.com https://player.vimeo.com` and
 * teach `blogPosts.collection.ts` to rewrite the url to its embed form at
 * ingest, so the renderer still builds its iframe from validated parts. Note
 * that the CSP header is currently Report-Only, so a missing directive would not
 * break anything today — it would file a report nobody reads and then break the
 * day someone enforces it.
 */
export function MediaCard({ kind, href, poster }: Props) {
  let host = ''
  try {
    host = new URL(href).hostname.replace(/^www\./, '')
  } catch {
    // Ingestion parsed and allowlisted this already; a value that fails here
    // would be a bug upstream, and the card degrades to no host rather than
    // throwing inside a render.
    host = ''
  }

  return (
    <figure className="blog-media">
      <a className="blog-media__link" href={href} target="_blank" rel="noreferrer noopener">
        <span className="blog-media__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="blog-media__text">
          <span className="blog-media__label">{LABEL[kind]}</span>
          {host !== '' && <span className="blog-media__host">{host}</span>}
        </span>
      </a>
      {poster?.caption !== undefined && (
        <figcaption className="blog-figure__caption">{poster.caption}</figcaption>
      )}
    </figure>
  )
}
