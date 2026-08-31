import type { ImageMedia } from '../content/types'
import { SIZES, type ImageSlot, sanityImageSrc, sanityImageSrcSet } from './sanityImage'

interface Props {
  image: ImageMedia
  slot: ImageSlot
  /**
   * True for the ONE image that is likely the largest thing painted in the first
   * viewport — the cover on an article route.
   *
   * It gets `eager` + `fetchpriority="high"` instead of lazy loading, because
   * lazily loading the LCP element means the browser discovers it after layout
   * and the metric measures the delay rather than the image. Everything else on
   * the page is below the fold by construction and stays lazy.
   */
  priority?: boolean
  className?: string
}

/**
 * One editorial image, with a caption when the editor wrote one.
 *
 * ── width and height are non-negotiable ──
 *
 * Both come from `ImageMedia`, which the content build filled in from Sanity's
 * asset metadata. Together with a CSS width they give the browser the aspect
 * ratio before a byte of the image arrives, so the space is reserved and nothing
 * below it moves. On a page whose whole job is reading, a paragraph that jumps
 * as an image loads is the most visible defect available.
 *
 * ── the caption is not the alt text ──
 *
 * `alt` REPLACES the image for someone who cannot see it; a caption is read
 * BESIDE it by everyone. Rendering the same string as both announces it twice to
 * a screen reader, which is why the schema carries two fields and why this
 * renders `<figcaption>` only when the second one exists.
 */
export function BlogFigure({ image, slot, priority = false, className }: Props) {
  const srcSet = sanityImageSrcSet(image, slot)

  // A caption belongs to the reading context, not to a thumbnail. On a card the
  // title and excerpt already say what the post is; a third line describing the
  // picture competes with them and pushes the meta row out of alignment across
  // a grid where only some posts have one.
  const showCaption = (slot === 'cover' || slot === 'body') && image.caption !== undefined

  return (
    <figure className={className === undefined ? 'blog-figure' : `blog-figure ${className}`}>
      <img
        className="blog-figure__img"
        src={sanityImageSrc(image, slot === 'card' ? 400 : 680, slot)}
        {...(srcSet === undefined ? {} : { srcSet, sizes: SIZES[slot] })}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
      {showCaption && <figcaption className="blog-figure__caption">{image.caption}</figcaption>}
    </figure>
  )
}
