import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BLOG_POSTS } from '../content/generated/blogPosts'
import type { BlogPost } from '../content/types'
import type { Route } from '../app/route'
import { BlogFigure } from './BlogFigure'
import { PostBody } from './PostBody'
import { filterPosts, topicsOf } from './blogFilter'
import { BlogFooter, BlogSurface } from './BlogSurface'
import { BLOG_NOT_FOUND_TITLE, blogIndexTitle, postDocumentTitle } from './documentTitle'
import { isPlainClick } from '../app/plainClick'
import { routeToPath } from '../app/route'
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

const Meta = ({ post, id }: { post: BlogPost; id?: string }) => (
  <span className="blog-meta" id={id}>
    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
    <span className="blog-meta__dot" aria-hidden="true" />
    {post.readingTime} min de lectura
  </span>
)

/**
 * A real link to a blog page whose plain click stays in the page (accessibility
 * audit 2026-11-18, G1): the cards, Anterior/Siguiente and «Ver todo el blog»
 * were buttons, so no crawler, list of links or new tab could reach a post. The
 * host still decides what a plain click does — open in place, or go back in
 * history to the index (`historial-y-salida.md`).
 */
function PageLink({
  href,
  onOpen,
  className,
  labelledBy,
  describedBy,
  children,
}: {
  href: string
  onOpen: () => void
  className: string
  labelledBy?: string
  describedBy?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className={className}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={(event) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        onOpen()
      }}
    >
      {children}
    </a>
  )
}

const postPath = (slug: string) => routeToPath({ name: 'blog-post', slug })

function Card({ post, onOpen, featured = false }: { post: BlogPost; onOpen: () => void; featured?: boolean }) {
  // Named by its title and described by its excerpt and its date (B12 of the 2026-11-18
  // accessibility audit): the whole card as one name was a paragraph, read
  // again on every Tab.
  const id = useId()
  return (
    <PageLink
      href={postPath(post.id)}
      className={featured ? 'blog-card blog-card--featured' : 'blog-card'}
      onOpen={onOpen}
      labelledBy={`${id}-title`}
      describedBy={`${id}-excerpt ${id}-meta`}
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
        <span className="blog-card__title" id={`${id}-title`}>{post.title}</span>
        <span className="blog-card__excerpt" id={`${id}-excerpt`}>{post.excerpt}</span>
        <Meta post={post} id={`${id}-meta`} />
      </span>
    </PageLink>
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
    <BlogSurface onBack={host.exitToScene}>
      <div className="blog-root" ref={rootRef}>
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

              {/* A group of toggles that filter this page, not a way to
                  another one: a nav landmark promised navigation (B14 of the
                  2026-11-18 accessibility audit). */}
              <div className="blog-pills" role="group" aria-label="Temas">
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
              </div>
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
              {/* A status, always mounted, so filtering or searching says how
                  many entries are left, «0 entradas» included (accessibility
                  audit 2026-11-18, B5): nothing announced it. */}
              <span className="blog-latest__count" role="status">
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
        <BlogFooter />
      </div>
    </BlogSurface>
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
    <BlogSurface onBack={host.returnToIndex} onHome={host.returnToIndex} onSearch={onSearch}>
      <div className="blog-root">
        {/* The page's main content, as the index has (accessibility audit
            2026-11-18, B8): the article and what follows it, not the footer.
            No class: nothing in blog.css styles a main here. */}
        <main>
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
                <PageLink href={postPath(previous.id)} className="blog-prevnext__card" onOpen={() => host.openPost(previous.id)}>
                  <span className="blog-prevnext__label">Anterior</span>
                  <span className="blog-prevnext__title">{previous.title}</span>
                </PageLink>
              ) : (
                <span />
              )}
              {next !== null && (
                <PageLink
                  href={postPath(next.id)}
                  className="blog-prevnext__card blog-prevnext__card--next"
                  onOpen={() => host.openPost(next.id)}
                >
                  <span className="blog-prevnext__label">Siguiente</span>
                  <span className="blog-prevnext__title">{next.title}</span>
                </PageLink>
              )}
            </nav>
          )}
        </article>

        {related.length > 0 && post.category !== null && (
          <section className="blog-related">
            <div className="blog-latest__head">
              <h2 className="blog-eyebrow">Más de {post.category.shortLabel}</h2>
              <PageLink href="/blog" className="blog-related__all" onOpen={host.returnToIndex}>
                Ver todo el blog
              </PageLink>
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
        </main>
        <BlogFooter />
      </div>
    </BlogSurface>
  )
}

function NotFound({ host }: { host: BlogHost }) {
  // A slug with no post is answered with HTTP 200, not a 404 (blog trap n.º 29:
  // the rewrite falls to blog.html, on purpose), so the page says noindex
  // itself, and gives the document its robots back on the way out (G3 of the
  // 2026-11-18 accessibility audit).
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const meta = existing ?? document.head.appendChild(document.createElement('meta'))
    const previous = existing?.content
    meta.name = 'robots'
    meta.content = 'noindex'
    return () => {
      if (previous === undefined) meta.remove()
      else meta.content = previous
    }
  }, [])

  return (
    <BlogSurface onBack={host.returnToIndex}>
      <div className="blog-root">
        <main className="blog-page">
          <h1 className="blog-article__title" tabIndex={-1}>
            Esa entrada no existe
          </h1>
          <p className="blog-article__standfirst">
            Puede que la dirección esté mal escrita o que la entrada ya no esté publicada.
          </p>
        </main>
        <BlogFooter />
      </div>
    </BlogSurface>
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

  // Leaving a WARM blog — the only kind that unmounts — left the focus on
  // <body>: the scene came back from `inert` with nothing in it focused
  // (accessibility audit 2026-11-18, D7). It goes to the scene header's Blog
  // link, the way in from a keyboard, a frame later, once the scene is no
  // longer inert, and only if nothing took it. Here rather than in App: the
  // app entry has a byte budget, and this costs it nothing. On a phone the link
  // is in the closed menu and the focus stays where it was.
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (active && active !== document.body) return
        document
          .querySelector<HTMLElement>('.app__scene .scene-shortcut[data-shortcut="blog"]')
          ?.focus({ preventScroll: true })
      })
    },
    [],
  )

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
  // The article the reader last had open, so going back to the index lands on
  // its card rather than on the h1, off screen above the restored scroll, with
  // the next Tab jumping to the top (accessibility audit 2026-11-18, B6).
  const lastArticle = useRef<string | null>(null)
  useEffect(() => {
    const wanted = searchIntent.current
    searchIntent.current = false
    const root = document.querySelector('.blog-root')
    if (root === null) return
    const search = wanted ? root.querySelector<HTMLElement>('.blog-search__input') : null
    const origin =
      !search && target === 'index' && lastArticle.current !== null
        ? root.querySelector<HTMLElement>(`.blog-card[href="${postPath(lastArticle.current)}"]`)
        : null
    const landing = search ?? origin ?? root.querySelector<HTMLElement>('[tabindex="-1"]')
    landing?.focus({ preventScroll: true })
    lastArticle.current = target === 'index' ? null : target
  }, [target])

  // The page scrolls inside `.blog-root`, not the document, so with the focus
  // on the header or on <body> the scrolling keys did nothing (B4). Those keys
  // are passed on to the reading area; Space only from <body>, where it
  // activates nothing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const root = document.querySelector<HTMLElement>('.blog-root')
      const at = event.target
      if (root === null || !(at instanceof Element)) return
      const fromBody = at === document.body || at === document.documentElement
      const fromHeader = at.closest('.site-header') !== null && !/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName)
      if (!fromBody && !fromHeader) return
      const page = root.clientHeight * 0.9
      const line = 40
      const by: Record<string, number | 'top' | 'end'> = {
        PageDown: page,
        PageUp: -page,
        ArrowDown: line,
        ArrowUp: -line,
        Home: 'top',
        End: 'end',
        ...(fromBody ? { ' ': event.shiftKey ? -page : page } : {}),
      }
      const step = by[event.key]
      if (step === undefined) return
      event.preventDefault()
      if (step === 'top') root.scrollTo({ top: 0 })
      else if (step === 'end') root.scrollTo({ top: root.scrollHeight })
      else root.scrollBy({ top: step })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A new article opens at its top (accessibility audit 2026-11-18, B2). The
  // article view reuses one `.blog-root` from post to post, so Anterior,
  // Siguiente or «Más de…» used to open the next one at the scroll the last
  // was left at, with its focused h1 out of sight. Before paint, and before
  // the focus above, which does not scroll.
  useLayoutEffect(() => {
    if (route.name !== 'blog-post') return
    const root = document.querySelector('.blog-root')
    if (root !== null) root.scrollTop = 0
  }, [target, route.name])

  const post = route.name === 'blog-post' ? BLOG_POSTS.find((entry) => entry.id === route.slug) : undefined

  // The tab says which page this is (B1), in the words of the prerendered
  // documents (`documentTitle.ts`). What the document was titled before the
  // blog is put back when the blog closes in a warm session.
  // Decided on every render but answered once per document, on the FIRST
  // render, before the effect below has written any title: a cold load that
  // starts on an article (the rewrite serves the index's shell there) must not
  // take that article's title for the index's.
  const indexTitle = blogIndexTitle()
  const title =
    route.name === 'blog-index'
      ? indexTitle
      : route.name === 'blog-post'
        ? post === undefined
          ? BLOG_NOT_FOUND_TITLE
          : postDocumentTitle(post)
        : null
  const titleBeforeBlog = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (title === null) {
      if (titleBeforeBlog.current !== null) document.title = titleBeforeBlog.current
      titleBeforeBlog.current = null
      return
    }
    titleBeforeBlog.current ??= document.title
    document.title = title
  }, [title])
  useLayoutEffect(
    () => () => {
      if (titleBeforeBlog.current !== null) document.title = titleBeforeBlog.current
    },
    [],
  )

  if (route.name === 'blog-index') return <Index host={host} topic={route.topic} />
  if (route.name === 'blog-post') {
    return post === undefined ? (
      <NotFound host={host} />
    ) : (
      <Article host={host} post={post} onSearch={openSearch} />
    )
  }
  return null
}
