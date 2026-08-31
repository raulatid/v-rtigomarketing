import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BLOG_POSTS } from '../content/generated/blogPosts'
import type { BlogPost } from '../content/types'
import type { Route } from '../app/route'
import { BlogFigure } from './BlogFigure'
import { PostBody } from './PostBody'
import { filterPosts, topicsOf } from './blogFilter'
import './blog.css'

/**
 * The blog, rendered identically by both hosts.
 *
 * ── One implementation, two documents ──
 *
 * `index.html` reaches this through `LazyBlog` while the 3D scene sits frozen
 * behind it; `blog.html` imports it directly and there is no scene at all. The
 * difference between those two worlds is `BlogHost.exitToScene` and nothing
 * else — no component below this file knows which document it is running in, and
 * none of them may find out by reading `history.state`.
 *
 * ── Why this file statically imports the dataset ──
 *
 * Because it is itself behind a dynamic boundary from the app entry.
 * `checks/architecture.ts` asserts exactly that: the generated blog module and
 * this component must not be STATICALLY reachable from `src/main.tsx`. Reaching
 * them from `src/entries/blog.tsx` is legal by construction, since that is a
 * second Rollup entry and the blog is all it contains.
 */

export interface BlogHost {
  /**
   * Leave the blog entirely.
   *
   * Warm: unwind history to the scene, no reload, no re-intro. Cold: a real
   * navigation to `/`. The HOST decides — this component must never infer which
   * world it is in from history depth, because depth is not identity.
   */
  exitToScene: () => void
  /** Index -> article. A push. */
  openPost: (slug: string) => void
  /** Article -> index. Unwinds; see `blogHistory.ts`. */
  returnToIndex: () => void
  /** Sets or clears the topic filter on the current entry. */
  replaceTopic: (topic: string | null) => void
  /** Called just before leaving the index, with its scroll offset. */
  rememberScroll: (scrollTop: number) => void
  /** The offset stored on the entry we are on, if any. */
  storedScrollTop: number | null
}

interface Props {
  route: Route
  host: BlogHost
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const formatDate = (iso: string): string => DATE_FORMAT.format(new Date(iso))

const Meta = ({ post }: { post: BlogPost }) => (
  <span className="blog-meta">
    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
    <span className="blog-meta__dot" aria-hidden="true" />
    {post.readingTime} min de lectura
  </span>
)

function BackControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="blog-back" onClick={onClick}>
      <svg viewBox="0 0 44 16" width="44" height="16" aria-hidden="true">
        <path
          d="M9 1 L2 8 L9 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="2" y1="8" x2="43" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="blog-back__label">{label}</span>
    </button>
  )
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="blog-topbar">
      {/* Both hosts render the same control; only what it does differs, and on
          an article it goes to the index rather than out of the blog. */}
      <BackControl label="Ir atrás" onClick={onBack} />
      <span className="blog-topbar__mark" aria-hidden="true">
        <svg viewBox="0 0 400 400" width="26" height="26">
          <path
            fill="currentColor"
            d="M33.7 13.6 7.7 39.4l4.7 3.4c92.3 67.2 193 82.8 292.7 45.5 30.2-11.3 63.8-30.1 85-47.4L354.1.2l-3.4 2.3c-37.9 26-78.1 42.2-118.4 47.7-19.1 2.6-39.4 2.9-58.5.7-26.4-3-52.3-10.2-77.5-21.7C79.3 21.5 62.2 11.4 49.9 1.8L47.5 0Z"
          />
          <path
            fill="currentColor"
            d="M34.5 99.7 168.6 399.5h62.5L365 99.7l-6 2.9c-20.4 10.2-45.7 20.3-65.4 26l-2.5.9-45.5 101.1-45.4 101.2-45.6-101.1L109.1 129.3l-1.7-.3c-13.6-2.4-43.2-14.2-69.4-27.7Z"
          />
        </svg>
      </span>
      <span className="blog-topbar__spacer" />
    </header>
  )
}

function Card({ post, onOpen, featured = false }: { post: BlogPost; onOpen: () => void; featured?: boolean }) {
  return (
    <button
      type="button"
      className={featured ? 'blog-card blog-card--featured' : 'blog-card'}
      onClick={onOpen}
    >
      {post.cover === null ? (
        // A deliberate empty frame rather than no frame: a grid where some cards
        // carry an image and others start at the eyebrow reads as broken layout
        // rather than as missing artwork.
        <span className="blog-card__placeholder" aria-hidden="true" />
      ) : (
        <BlogFigure
          image={post.cover}
          slot={featured ? 'featured' : 'card'}
          className={featured ? 'blog-figure--featured' : 'blog-figure--card'}
        />
      )}
      <span className="blog-card__text">
        {post.category !== null && <span className="blog-card__eyebrow">{post.category.shortLabel}</span>}
        <span className="blog-card__title">{post.title}</span>
        <span className="blog-card__excerpt">{post.excerpt}</span>
        <Meta post={post} />
      </span>
    </button>
  )
}

function Index({ host, topic }: { host: BlogHost; topic: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const topics = useMemo(() => topicsOf(BLOG_POSTS), [])

  // THE SEMANTIC HALF of topic validation. `route.ts` decides whether `?tema=`
  // is SHAPED like a topic; only here, where the posts are loaded, can we know
  // whether one exists. An unknown-but-well-formed value is treated as no filter
  // and the URL is canonicalised with REPLACE, so the bad link never becomes a
  // history entry the reader can go back into.
  const unknownTopic = topic !== null && !topics.has(topic)
  useEffect(() => {
    if (unknownTopic) host.replaceTopic(null)
  }, [unknownTopic, host])

  const active = unknownTopic ? null : topic
  const posts = useMemo(() => filterPosts(BLOG_POSTS, active, query), [active, query])

  // Restored after the list renders rather than in an effect: an effect runs a
  // paint later and the reader sees the top of the page first.
  useLayoutEffect(() => {
    if (host.storedScrollTop !== null && rootRef.current !== null) {
      rootRef.current.scrollTop = host.storedScrollTop
    }
  }, [host.storedScrollTop])

  const open = (slug: string) => {
    if (rootRef.current !== null) host.rememberScroll(rootRef.current.scrollTop)
    host.openPost(slug)
  }

  // The newest post leads, but only in the unfiltered, unsearched view: a
  // "featured" slot inside a filtered list is just the first result wearing a
  // bigger typeface, and it pushes the rest below the fold for no reason.
  const showFeatured = active === null && query.trim() === '' && posts.length > 1
  const featured = showFeatured ? posts[0] : null
  const rest = showFeatured ? posts.slice(1) : posts

  return (
    <div className="blog-root" ref={rootRef}>
      <TopBar onBack={host.exitToScene} />
      <main className="blog-page">
        <section className="blog-hero">
          <span className="blog-eyebrow">Blog</span>
          <div className="blog-hero__row">
            <h1 className="blog-hero__title" tabIndex={-1}>
              Ideas que se miden
            </h1>
            <p className="blog-hero__standfirst">
              Lo que aprendemos trabajando con datos reales, escrito para quien firma el presupuesto.
            </p>
          </div>

          <div className="blog-controls">
            <label className="blog-search">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                className="blog-search__input"
                placeholder="Buscar en el blog"
                aria-label="Buscar en el blog"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            <nav className="blog-pills" aria-label="Temas">
              <button
                type="button"
                className="blog-pill"
                aria-pressed={active === null}
                onClick={() => host.replaceTopic(null)}
              >
                Todos
              </button>
              {[...topics].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="blog-pill"
                  aria-pressed={active === id}
                  onClick={() => host.replaceTopic(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </section>

        {featured !== null && (
          <section className="blog-featured">
            <Card post={featured} onOpen={() => open(featured.id)} featured />
          </section>
        )}

        <section className="blog-latest">
          <div className="blog-latest__head">
            <span className="blog-latest__label">
              {showFeatured ? 'Últimas entradas' : 'Resultados'}
            </span>
            <span className="blog-latest__count">
              {posts.length === 1 ? '1 entrada' : `${posts.length} entradas`}
            </span>
          </div>

          {rest.length === 0 ? (
            <p className="blog-empty">No hay entradas que coincidan. Prueba con otro tema o otra búsqueda.</p>
          ) : (
            <ul className="blog-grid">
              {rest.map((post) => (
                <li key={post.id}>
                  <Card post={post} onOpen={() => open(post.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}

function Article({ host, post }: { host: BlogHost; post: BlogPost }) {
  const index = BLOG_POSTS.findIndex((entry) => entry.id === post.id)
  // BLOG_POSTS is ordered `publishedAt desc`, so the NEXT entry in the array is
  // the older post. "Anterior" means earlier in time, which is forward here.
  const previous = index >= 0 && index + 1 < BLOG_POSTS.length ? BLOG_POSTS[index + 1] : null
  const next = index > 0 ? BLOG_POSTS[index - 1] : null

  const related = useMemo(
    () =>
      post.category === null
        ? []
        : BLOG_POSTS.filter(
            (entry) => entry.id !== post.id && entry.category?.id === post.category?.id,
          ).slice(0, 3),
    [post],
  )

  return (
    <div className="blog-root">
      {/* "Ir atrás" from an article returns to the INDEX, not out of the blog.
          They look alike in the artboards and are different operations. */}
      <TopBar onBack={host.returnToIndex} />
      <article className="blog-article">
        {post.category !== null && <span className="blog-eyebrow">{post.category.label}</span>}
        <h1 className="blog-article__title" tabIndex={-1}>
          {post.title}
        </h1>
        <p className="blog-article__standfirst">{post.excerpt}</p>
        <div className="blog-article__meta">
          <Meta post={post} />
          {post.tags.length > 0 && (
            <span className="blog-tags">
              {post.tags.map((tag) => (
                <span key={tag} className="blog-tag">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* The one image on the page that is probably the LCP element. */}
        {post.cover !== null && <BlogFigure image={post.cover} slot="cover" priority />}

        <PostBody body={post.body} />

        {(previous !== null || next !== null) && (
          <nav className="blog-prevnext" aria-label="Entradas anterior y siguiente">
            {previous !== null ? (
              <button type="button" className="blog-prevnext__card" onClick={() => host.openPost(previous.id)}>
                <span className="blog-prevnext__label">Anterior</span>
                <span className="blog-prevnext__title">{previous.title}</span>
              </button>
            ) : (
              <span />
            )}
            {next !== null && (
              <button
                type="button"
                className="blog-prevnext__card blog-prevnext__card--next"
                onClick={() => host.openPost(next.id)}
              >
                <span className="blog-prevnext__label">Siguiente</span>
                <span className="blog-prevnext__title">{next.title}</span>
              </button>
            )}
          </nav>
        )}
      </article>

      {related.length > 0 && post.category !== null && (
        <section className="blog-related">
          <div className="blog-latest__head">
            <span className="blog-eyebrow">Más de {post.category.shortLabel}</span>
            <button type="button" className="blog-related__all" onClick={host.returnToIndex}>
              Ver todo el blog
            </button>
          </div>
          <ul className="blog-grid">
            {related.map((entry) => (
              <li key={entry.id}>
                <Card post={entry} onOpen={() => host.openPost(entry.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <Footer />
    </div>
  )
}

function NotFound({ host }: { host: BlogHost }) {
  return (
    <div className="blog-root">
      <TopBar onBack={host.returnToIndex} />
      <main className="blog-page">
        <h1 className="blog-article__title" tabIndex={-1}>
          Esa entrada no existe
        </h1>
        <p className="blog-article__standfirst">
          Puede que la dirección esté mal escrita o que la entrada ya no esté publicada.
        </p>
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="blog-footer">
      <span>© 2026 Vértigo</span>
    </footer>
  )
}

export default function BlogRoute({ route, host }: Props) {
  // Focus moves into the blog on arrival. When the scene wrapper goes `inert`
  // the browser blurs whatever was focused inside it to <body>, which loses the
  // reader's place entirely; the heading is the deterministic landing point, and
  // `preventScroll` stops the focus call fighting the scroll restore.
  const target = route.name === 'blog-post' ? route.slug : 'index'
  useEffect(() => {
    document.querySelector<HTMLElement>('.blog-root [tabindex="-1"]')?.focus({ preventScroll: true })
  }, [target])

  if (route.name === 'blog-index') return <Index host={host} topic={route.topic} />
  if (route.name === 'blog-post') {
    const post = BLOG_POSTS.find((entry) => entry.id === route.slug)
    return post === undefined ? <NotFound host={host} /> : <Article host={host} post={post} />
  }
  return null
}
