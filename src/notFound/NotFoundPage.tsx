import { BlogFooter, BlogSurface } from '../blog/BlogSurface'
import { NotFoundLogo } from './NotFoundLogo'
import './notFound.css'

/**
 * The page behind `404.html`: the site's header and floor line around a large
 * turning isotype and three lines of copy.
 *
 * It borrows the blog's chrome (`BlogSurface`) rather than the scene's because
 * this is a 2D document with no Canvas, exactly like the cold blog — and the
 * blog header is the one already built for that. The ground is the scene's
 * black, not the blog's paper: the mark is brand white, and this page exists to
 * show it.
 *
 * `goHome` is a prop for the same reason `BlogHost.exitToScene` is: what
 * leaving means is the document's decision (a real navigation to `/`), and a
 * unit test should not need `window.location`.
 */
export function NotFoundPage({ goHome }: { goHome: () => void }) {
  return (
    <BlogSurface onBack={goHome} markUpgrade={false} className="blog-surface--not-found">
      <div className="blog-root not-found">
        <main className="not-found__main">
          <NotFoundLogo />
          <div className="not-found__text">
            <p className="not-found__code">404</p>
            <h1 className="not-found__title" tabIndex={-1}>
              Vaya, algo ha pasado
            </h1>
            <p className="not-found__lead">La página que buscas no existe o ya no está disponible.</p>
            <a className="not-found__link" href="/">
              Volver al inicio
            </a>
          </div>
        </main>
        <BlogFooter />
      </div>
    </BlogSurface>
  )
}
