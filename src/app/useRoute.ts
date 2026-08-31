import { useCallback, useEffect, useState } from 'react'
import { INITIAL_ROUTE, type Route, parseRoute, routeToPath } from './route'
import {
  type BlogHistoryState,
  nextIndexDelta,
  readBlogState,
  stepsBackToIndex,
  stepsBackToScene,
  writeBlogState,
} from './blogHistory'

/**
 * Route state, and the three history operations the blog needs.
 *
 * ── Every path ends in a URL change, never in a direct state write ──
 *
 * `history.back()` and `history.go()` are asynchronous and fire `popstate`, and
 * that listener is the ONE place the React route is updated. Setting state
 * alongside a history call would run the same transition twice — once from the
 * new URL and once from a URL that had not changed yet — and the two would
 * disagree for a frame. So the operations below move history; the listener
 * moves React.
 *
 * `pushState` and `replaceState` do NOT fire `popstate`, so those two set state
 * themselves. That asymmetry is the platform's, not this module's.
 */
export interface RouteNavigation {
  route: Route
  /** Scene -> blog index. A push, so the scene entry stays behind it. */
  openBlogIndex: () => void
  /** Index -> article. A push, recording how far back the index now is. */
  openPost: (slug: string) => void
  /** Article -> index. UNWINDS; never pushes. See `blogHistory.ts`. */
  returnToIndex: () => void
  /** Replaces the current entry. Filters and canonicalisation, not navigation. */
  replaceTopic: (topic: string | null) => void
  /** Stores the index's scroll offset on the entry we are about to leave. */
  rememberScroll: (scrollTop: number) => void
  /** What was stored on the entry we are on now, if anything. */
  storedScrollTop: number | null
  /** Warm host only: leaves the blog by unwinding past the index. */
  exitToSceneByHistory: () => boolean
}

function currentBlogState(): BlogHistoryState | null {
  return readBlogState(window.history.state)
}

export function useRoute(): RouteNavigation {
  const [route, setRoute] = useState<Route>(INITIAL_ROUTE)
  const [storedScrollTop, setStoredScrollTop] = useState<number | null>(
    typeof window === 'undefined' ? null : (currentBlogState()?.scrollTop ?? null),
  )

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname, window.location.search))
      setStoredScrollTop(currentBlogState()?.scrollTop ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /**
   * `manual` is BORROWED for as long as the blog is showing, then handed back.
   *
   * The blog scrolls inside a fixed `overflow-y: auto` element because `body` is
   * `overflow: hidden`, so the browser's own restoration has nothing useful to
   * restore and would fight the `useLayoutEffect` that does. But in a warm
   * session this is a property of the SAME document that outlives the blog:
   * leaving it on `manual` would quietly change scrolling for the rest of the 3D
   * session, with nothing connecting the symptom to the cause.
   *
   * The previous value is read rather than assumed — a browser or another
   * feature may already have set it — and written back on cleanup. In the cold
   * host the document is discarded anyway, so this is a no-op there; the same
   * code runs in both because behaviour that is only correct in one host is a
   * trap for whoever changes the other.
   */
  const onBlog = route.name !== 'site'
  useEffect(() => {
    if (!onBlog) return
    if (!('scrollRestoration' in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [onBlog])

  const push = useCallback((next: Route, blogState: BlogHistoryState) => {
    window.history.pushState(writeBlogState(null, blogState), '', routeToPath(next))
    setRoute(next)
    setStoredScrollTop(blogState.scrollTop ?? null)
  }, [])

  const openBlogIndex = useCallback(() => {
    push({ name: 'blog-index', topic: null }, { indexDelta: 0 })
  }, [push])

  const openPost = useCallback(
    (slug: string) => {
      push({ name: 'blog-post', slug }, { indexDelta: nextIndexDelta(currentBlogState()) })
    },
    [push],
  )

  const returnToIndex = useCallback(() => {
    const steps = stepsBackToIndex(currentBlogState())
    if (steps === null || steps === 0) {
      // A deep-linked article: there is no index entry behind us, so REPLACE.
      // Pushing would add an entry that swallows the reader's next attempt to
      // leave the blog entirely.
      const next: Route = { name: 'blog-index', topic: null }
      window.history.replaceState(
        writeBlogState(window.history.state, { indexDelta: 0 }),
        '',
        routeToPath(next),
      )
      setRoute(next)
      setStoredScrollTop(null)
      return
    }
    // Unwinds to the original index entry, restoring its URL, its filter and the
    // scroll position stored on it, and leaving history depth where it started.
    window.history.go(-steps)
  }, [])

  const replaceTopic = useCallback(
    (topic: string | null) => {
      if (route.name !== 'blog-index') return
      const next: Route = { name: 'blog-index', topic }
      const existing = currentBlogState()
      window.history.replaceState(
        writeBlogState(window.history.state, {
          indexDelta: existing?.indexDelta ?? 0,
          ...(existing?.scrollTop === undefined ? {} : { scrollTop: existing.scrollTop }),
        }),
        '',
        routeToPath(next),
      )
      setRoute(next)
    },
    [route.name],
  )

  const rememberScroll = useCallback((scrollTop: number) => {
    const existing = currentBlogState()
    window.history.replaceState(
      writeBlogState(window.history.state, {
        indexDelta: existing?.indexDelta ?? 0,
        scrollTop,
      }),
      '',
      window.location.pathname + window.location.search,
    )
  }, [])

  /**
   * Returns false when there is nothing to unwind to, so the caller can fall
   * back. The warm host is the only caller: the cold host leaves with a real
   * navigation and never consults history at all.
   */
  const exitToSceneByHistory = useCallback(() => {
    const steps = stepsBackToScene(currentBlogState())
    if (steps === null) return false
    window.history.go(-steps)
    return true
  }, [])

  return {
    route,
    openBlogIndex,
    openPost,
    returnToIndex,
    replaceTopic,
    rememberScroll,
    storedScrollTop,
    exitToSceneByHistory,
  }
}
