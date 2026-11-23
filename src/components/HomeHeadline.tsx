import { HOME_HEADLINE } from '../content/site'
import './homeHeadline.css'

/**
 * The home page's h1 and the line under it (plan 029a §4), from «Ajustes del
 * sitio»: a title card centred over the planet (block 9, I4). Its letters fly
 * in on an orbit drawn by the scene (`HeadlineFlightLayer`), which finds this
 * block by its class; this component knows nothing of that.
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
export function HomeHeadline({ shown = false }: { shown?: boolean }) {
  return (
    <div className="home-headline" data-shown={shown}>
      <h1 className="home-headline__title">{HOME_HEADLINE.headline}</h1>
      <p className="home-headline__line">{HOME_HEADLINE.subheadline}</p>
    </div>
  )
}
