/**
 * Which page the URL names.
 *
 * A parser and a frozen module constant, following `protoHolo.ts`: the pure
 * function is what tests can reach, and the constant is what everything reads.
 *
 * ── SYNTAX ONLY, and that boundary is load-bearing ──
 *
 * This module decides whether `?tema=analitica` is SHAPED like a topic. It
 * cannot decide whether `analitica` names a real one, and it must not try:
 * answering that means importing the generated content, and this module is
 * reached from `src/main.tsx`, so the dataset would land in the initial JS
 * closure of `/` — which `vite.config.ts` budgets as a whole, and
 * `checks/architecture.ts` forbids at the import.
 *
 * The semantic half lives in the lazy blog chunk, where the categories are
 * already loaded. A well-formed topic that names nothing is treated as no
 * filter and the URL is canonicalised with `replaceState`, so a bad link does
 * not become a history entry the reader can go back to.
 *
 * ── `tema` outside, `topic` inside ──
 *
 * The query parameter a visitor sees and shares is Spanish, like every other
 * visitor-facing string in this application (DECISIONS §11). The TypeScript
 * property is English, like every other identifier. This module is the only
 * place the two meet, so nothing downstream has to remember the translation.
 */

/**
 * The same alphabet every content id uses (`src/content/invariants.ts`).
 *
 * DUPLICATED HERE ON PURPOSE, and it is the one duplication in this feature that
 * is not an oversight: `invariants.ts` is leaf infrastructure the content build
 * also bundles for Node, and importing it here to reuse one regex would put the
 * whole module in the app entry to save twenty bytes. A slug and a topic are
 * URL segments; that is the reason for the shape, and it is stated in both
 * places rather than shared between them.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** The public name of the topic filter. Spanish, because a visitor reads it. */
export const TOPIC_PARAM = 'tema'

export type Route =
  | { readonly name: 'site' }
  | { readonly name: 'blog-index'; readonly topic: string | null }
  | { readonly name: 'blog-post'; readonly slug: string }

export const SITE: Route = Object.freeze({ name: 'site' })

/** Trailing slashes stripped exactly as `App.tsx` does for `/debug`. */
function segments(pathname: string): string[] {
  return pathname.replace(/\/+$/, '').split('/').filter(Boolean)
}

/**
 * `pathname` AND `search`, never pathname alone.
 *
 * The topic is part of the route rather than component state because it has to
 * survive back, forward, reload and being pasted into a message. Search TEXT
 * deliberately is not: reflecting a text input into history on every keystroke
 * produces a back button nobody can use.
 */
export function parseRoute(pathname: string, search: string): Route {
  const parts = segments(pathname)

  if (parts.length === 0 || parts[0] !== 'blog') return SITE

  if (parts.length === 1) {
    const raw = new URLSearchParams(search).get(TOPIC_PARAM)
    // A malformed value fails safely to "all topics" rather than to an error
    // page. A query parameter is the least trustworthy input a page takes.
    const topic = raw !== null && ID_PATTERN.test(raw) ? raw : null
    return { name: 'blog-index', topic }
  }

  // `/blog/a/b` is not a post two levels deep — there is no such thing — so it
  // falls back to the site rather than rendering an article for `a`.
  if (parts.length === 2 && ID_PATTERN.test(parts[1])) {
    return { name: 'blog-post', slug: parts[1] }
  }

  return SITE
}

/**
 * The path a route should be pushed to.
 *
 * Carries ONLY blog-owned parameters. Scene and debug flags — `?holo=`,
 * `?pinch=`, `?stats=`, `?debugNavigation=` — are deliberately not merged in:
 * the previous history entry already holds the scene URL with them intact, and
 * `history.back()` restores it verbatim. Copying them forward would put debug
 * flags into article URLs that get shared.
 */
export function routeToPath(route: Route): string {
  if (route.name === 'site') return '/'
  if (route.name === 'blog-post') return `/blog/${route.slug}`
  if (route.topic === null) return '/blog'
  return `/blog?${TOPIC_PARAM}=${encodeURIComponent(route.topic)}`
}

/**
 * The route this DOCUMENT was opened at. Read once, like `DEBUG_MODE`.
 *
 * Note what this is not: a warm/cold signal. Which document is running decides
 * that, and each host says so by supplying its own `exitToScene` — see
 * `src/blog/BlogRoute.tsx`. Inferring it from history was tried and rejected in
 * review; history depth is not identity.
 */
export const INITIAL_ROUTE: Route =
  typeof window === 'undefined' ? SITE : parseRoute(window.location.pathname, window.location.search)
