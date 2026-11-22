import { HOME_HEADLINE } from '../content/site'
import { DEBUG_TOOLS_ENABLED } from '../platform/buildFlags'
import './homeHeadline.css'

/**
 * How the h1 shows over the Earth. `hidden` is clipped to a pixel: in the
 * accessibility tree and in the HTML, not on screen. The others are the design
 * variants under review (plan 029a §4, block 3 of the delivery list), reachable
 * only outside production with `?h1=a|b|c` until one is chosen.
 */
export type HeadlineVariant = 'hidden' | 'a' | 'b' | 'c'

const VARIANTS: readonly HeadlineVariant[] = ['hidden', 'a', 'b', 'c']

/** The variant this document shows. Production always gets `hidden` for now. */
export function headlineVariant(search: string = window.location.search): HeadlineVariant {
  if (!DEBUG_TOOLS_ENABLED) return 'hidden'
  const asked = new URLSearchParams(search).get('h1')
  return VARIANTS.find((v) => v === asked) ?? 'hidden'
}

/**
 * The home page's h1 and the line under it (plan 029a §4), from «Ajustes del
 * sitio».
 *
 * `index.html` carries the same two strings as static HTML inside `#root`,
 * written by the build, for crawlers and for a page that never runs this.
 * React's first commit clears that copy and this one takes its place, so there
 * is exactly one h1 at every moment. `scripts/siteHead.test.ts` holds the two
 * to the same text.
 *
 * ALWAYS MOUNTED, inside `.app__scene`: the heading of the page does not wait
 * for `site`, and it goes `inert` with the rest of the scene when the blog
 * opens. `shown` only fades it, with opacity rather than `visibility`, so a
 * screen reader can still name the page while the intro plays or a panel is
 * open.
 */
export function HomeHeadline({
  shown = false,
  variant = 'hidden',
}: {
  shown?: boolean
  variant?: HeadlineVariant
}) {
  return (
    <div className="home-headline" data-variant={variant} data-shown={shown}>
      <h1 className="home-headline__title">{HOME_HEADLINE.headline}</h1>
      <p className="home-headline__line">{HOME_HEADLINE.subheadline}</p>
    </div>
  )
}
