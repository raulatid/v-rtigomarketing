import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BLOG_POSTS } from '../content/generated/blogPosts'
import type { BlogPost } from '../content/types'
import type { Route } from '../app/route'
import { BlogFigure } from './BlogFigure'
import { BlogHeaderLogo } from './BlogHeaderLogo'
import { PostBody } from './PostBody'
import { filterPosts, topicsOf } from './blogFilter'
import { SiteHeader } from '../components/SiteHeader'
import { AuditSection } from '../components/AuditSection'
import { ContactSection } from '../components/ContactSection'
import { LegalPanel } from '../components/LazyLegalPanel'
import { ConsentBanner } from '../components/ConsentBanner'
import type { LegalDocId } from '../content/site'
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
  /**
   * The blog is mounted and about to paint.
   *
   * For the warm host only, and it has exactly one caller's worth of meaning:
   * the display's approach ends with a full-screen cover over the canvas, and
   * this is the moment that cover has nothing left to hide. The cold entry
   * leaves it undefined — there is no scene behind that document and nothing
   * covering anything.
   *
   * A HOST callback rather than something the blog reaches for, because the
   * boundary runs the other way: `checks/architecture.ts` forbids `src/blog/`
   * from importing an experience, and this component has no idea a 3D scene is
   * involved. It reports that it exists; `App` decides what that is worth.
   */
  onMounted?: () => void
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

/**
 * Two glyphs, one per breakpoint, because a viewBox does not rescale.
 *
 * The desktop artboard draws a long arrow beside the word; the phone artboard
 * draws a square chevron alone. Constraining the 44x16 arrow to a 44px square —
 * which is what the mobile rule did before — renders it at 22x8, adrift in the
 * middle of its own tap target. CSS shows exactly one of these at a time.
 */
function BackControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="blog-back" onClick={onClick}>
      <svg className="blog-back__arrow" viewBox="0 0 44 16" width="44" height="16" aria-hidden="true">
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
      <svg
        className="blog-back__chevron"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="blog-back__label">{label}</span>
    </button>
  )
}

const noop = () => {}

/**
 * The bar, and how many controls it carries depends on where you are.
 *
 * It is the SITE's header (components/SiteHeader.tsx, 2026-09-03) in its blog
 * dress — paper, a hairline, the mark centred where the scene draws its 3D logo
 * — carrying the two doors every surface carries, Contacto and Auditoría. Both
 * sections mount HERE, in the blog, with their own ids: in a warm session App's
 * copies sit hidden and inert behind this page, and a cold `blog.html` has no
 * App at all. This component still knows nothing about which document it is in.
 *
 * On the INDEX there is nowhere for a mark or a search icon to go — the search
 * field is already on the page and the mark would link to the page you are on —
 * so the mark is decorative and the third cell holds the doors alone.
 *
 * On an ARTICLE both have somewhere to go, and `MovilArticulo.dc.html` draws all
 * three as 44x44 targets. The search control is in the markup at every width and
 * hidden above the breakpoint, where the desktop artboards draw none.
 */
function TopBar({
  onBack,
  onHome,
  onSearch,
}: {
  onBack: () => void
  onHome?: () => void
  onSearch?: () => void
}) {
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null)

  return (
    <>
      <SiteHeader
        layout="blog"
        // The bar is black (siteHeader.css, plan 019 §4): a dark ground, and the
        // header's two triggers dress for it the way they do over Earth.
        tone="dark"
        hasActions
        onActionsHost={setActionsHost}
        // Both hosts render the same control; only what it does differs, and on
        // an article it goes to the index rather than out of the blog.
        leading={<BackControl label="Ir atrás" onClick={onBack} />}
        // The SVG mark, which upgrades itself to the scene's 3D logo once that
        // has loaded — deferred, and never at the article's expense. Both the
        // decorative and the go-home shapes live in there, because which one it
        // is has nothing to do with how it is drawn.
        brand={<BlogHeaderLogo onHome={onHome} />}
        extra={
          onSearch === undefined ? undefined : (
            <button
              type="button"
              className="blog-topbar__search"
              aria-label="Buscar en el blog"
              onClick={onSearch}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          )
        }
      />

      {/* Contacto first: portals append in mount order and it sits to the LEFT
          of the Auditoría box. The blog has no scene to recompose and no global
          Escape handler to stand down, hence `recomposesScene={false}` and the
          no-op. */}
      <ContactSection
        ready
        triggerHost={actionsHost}
        idPrefix="blog-contact"
        suppressed={auditOpen}
        onOpenChange={noop}
        onOpenLegal={setLegalDoc}
      />
      <AuditSection
        ready
        triggerHost={actionsHost}
        idPrefix="blog-audit"
        recomposesScene={false}
        onOpenChange={setAuditOpen}
        onOpenLegal={setLegalDoc}
      />
      <LegalPanel doc={legalDoc} idPrefix="blog-legal" onClose={() => setLegalDoc(null)} />
      {/* The blog's own copy, under its own LegalPanel: the scene's copy is
          hidden with the scene in a warm session and absent in a cold one. Both
          read one consent record, so a choice made here closes both. */}
      <ConsentBanner idPrefix="blog-consent" onOpenLegal={setLegalDoc} />
    </>
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
                maxLength={200}
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
            {/* A heading, not a label that looks like one: the index had an h1
                and nothing under it, so navigating by headings landed on the
                page title and stopped. Styled to render exactly as before. */}
            <h2 className="blog-latest__label">
              {showFeatured ? 'Últimas entradas' : 'Resultados'}
            </h2>
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

function Article({
  host,
  post,
  onSearch,
}: {
  host: BlogHost
  post: BlogPost
  onSearch: () => void
}) {
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
      <TopBar onBack={host.returnToIndex} onHome={host.returnToIndex} onSearch={onSearch} />
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
            <h2 className="blog-eyebrow">Más de {post.category.shortLabel}</h2>
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
  /**
   * "The reader asked for search on the way here", carried across one route
   * change.
   *
   * A REF rather than state, and rather than anything on `BlogHost`. The index
   * is where the search field lives, so the article's search control has to
   * navigate before it can focus anything — and the two are separated by a
   * `history.go`, which resolves asynchronously in a later task. State would
   * work, but clearing it is a second render that re-runs the effect below and
   * takes the focus straight back off the input. A ref is read and spent in the
   * same pass, and no component below re-renders because of it.
   *
   * It deliberately does NOT live in `history.state`: an intent is not a
   * location, and a reader who used the back button to arrive at this same entry
   * should land on the heading like everyone else.
   */
  // Fires once per mount of this component, before paint. `useLayoutEffect`
  // rather than `useEffect` so the cover is released in the same commit the
  // blog's own pixels are written in, rather than a frame after them.
  const onMounted = host.onMounted
  useLayoutEffect(() => {
    onMounted?.()
  }, [onMounted])

  const searchIntent = useRef(false)
  const openSearch = () => {
    searchIntent.current = true
    host.returnToIndex()
  }

  // Focus moves into the blog on arrival. When the scene wrapper goes `inert`
  // the browser blurs whatever was focused inside it to <body>, which loses the
  // reader's place entirely; the heading is the deterministic landing point, and
  // `preventScroll` stops the focus call fighting the scroll restore.
  const target = route.name === 'blog-post' ? route.slug : 'index'
  useEffect(() => {
    const wanted = searchIntent.current
    searchIntent.current = false
    const root = document.querySelector('.blog-root')
    if (root === null) return
    const search = wanted ? root.querySelector<HTMLElement>('.blog-search__input') : null
    const landing = search ?? root.querySelector<HTMLElement>('[tabindex="-1"]')
    landing?.focus({ preventScroll: true })
  }, [target])

  if (route.name === 'blog-index') return <Index host={host} topic={route.topic} />
  if (route.name === 'blog-post') {
    const post = BLOG_POSTS.find((entry) => entry.id === route.slug)
    return post === undefined ? (
      <NotFound host={host} />
    ) : (
      <Article host={host} post={post} onSearch={openSearch} />
    )
  }
  return null
}
