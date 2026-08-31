/**
 * The blog's history bookkeeping, as pure functions over `history.state`.
 *
 * ── The bug this exists to prevent ──
 *
 * Treating "article -> index" as a push produces
 * `Murcia -> /blog -> /blog/article -> /blog`, and then a single
 * `history.back()` out of the blog lands on the ARTICLE. The reader cannot
 * leave, and the index's scroll position is gone with it. So going back to the
 * index UNWINDS: every pushed blog entry records how many steps away the index
 * is, and `returnToIndex` walks exactly that far.
 *
 * ── What history.state is and is not used for ──
 *
 * It carries how deep in the blog we are, and where the index was scrolled to.
 * Both are facts only the history entry can know. It is NOT used to work out
 * whether the blog was opened warm or cold: which document is running decides
 * that, and each host says so by supplying its own `exitToScene`.
 *
 * Namespaced under `vertigo` because the state object belongs to the document,
 * not to this feature, and a future writer must be able to add a key without
 * reading this file.
 */

export interface BlogHistoryState {
  /**
   * How many history entries back the blog index sits.
   *
   * `0` on the index itself. `1` on an article opened from it. `2` on an article
   * opened from that article — a prev/next or a related card, which are pushes
   * like any other.
   */
  indexDelta: number
  /** Where the index was scrolled to when the reader left it, in pixels. */
  scrollTop?: number
}

interface Namespaced {
  vertigo?: unknown
}

/**
 * Reads our slice back, tolerating anything.
 *
 * `history.state` survives a reload, so it can be a shape written by an older
 * deployment, by another feature, or by a browser restoring a session. Every
 * field is checked rather than trusted; the fallback is always "no blog history
 * here", which degrades to a replace instead of an unwind.
 */
export function readBlogState(state: unknown): BlogHistoryState | null {
  if (state === null || typeof state !== 'object') return null
  const scoped = (state as Namespaced).vertigo
  if (scoped === null || scoped === undefined || typeof scoped !== 'object') return null

  const { indexDelta, scrollTop } = scoped as Record<string, unknown>
  if (typeof indexDelta !== 'number' || !Number.isInteger(indexDelta) || indexDelta < 0) return null

  const value: BlogHistoryState = { indexDelta }
  if (typeof scrollTop === 'number' && Number.isFinite(scrollTop) && scrollTop >= 0) {
    value.scrollTop = scrollTop
  }
  return value
}

/** Wraps our slice for `pushState` / `replaceState`, preserving foreign keys. */
export function writeBlogState(existing: unknown, next: BlogHistoryState): unknown {
  const base = existing !== null && typeof existing === 'object' ? { ...existing } : {}
  return { ...base, vertigo: next }
}

/** What the entry being pushed should record. One deeper than where we are. */
export function nextIndexDelta(current: BlogHistoryState | null): number {
  return current === null ? 1 : current.indexDelta + 1
}

/**
 * How far back the index is, or `null` when there is none behind us.
 *
 * `null` is the deep-linked article — someone opened `/blog/<slug>` directly, so
 * there is no index entry to unwind to and the caller must REPLACE to `/blog`
 * rather than push. Pushing there would add an entry that swallows the reader's
 * next attempt to leave.
 */
export function stepsBackToIndex(current: BlogHistoryState | null): number | null {
  if (current === null) return null
  return current.indexDelta === 0 ? 0 : current.indexDelta
}

/**
 * How far back the scene is, from anywhere in the blog.
 *
 * One past the index. Called from the index itself (`indexDelta` 0) this is a
 * plain `history.back()`, which is the common case and the one the artboards
 * draw; called from an article it steps over the index too.
 *
 * `null` when there is no blog history at all, which in the warm host means the
 * blog was never pushed and there is nothing to go back to.
 */
export function stepsBackToScene(current: BlogHistoryState | null): number | null {
  if (current === null) return null
  return current.indexDelta + 1
}
