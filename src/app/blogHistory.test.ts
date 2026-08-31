import { describe, expect, it } from 'vitest'
import {
  nextIndexDelta,
  readBlogState,
  stepsBackToIndex,
  stepsBackToScene,
  writeBlogState,
} from './blogHistory'

describe('readBlogState', () => {
  it('reads a well-formed slice', () => {
    expect(readBlogState({ vertigo: { indexDelta: 2, scrollTop: 480 } })).toEqual({
      indexDelta: 2,
      scrollTop: 480,
    })
  })

  it('tolerates every shape a stale or foreign state can take', () => {
    // history.state survives a reload, so it can be written by an older
    // deployment, another feature, or a session restore. The fallback is always
    // "no blog history", which degrades to a replace rather than a wrong unwind.
    for (const state of [
      null,
      undefined,
      'string',
      42,
      {},
      { vertigo: null },
      { vertigo: 'nope' },
      { vertigo: {} },
      { vertigo: { indexDelta: -1 } },
      { vertigo: { indexDelta: 1.5 } },
      { vertigo: { indexDelta: 'two' } },
    ]) {
      expect(readBlogState(state), JSON.stringify(state)).toBeNull()
    }
  })

  it('drops a nonsense scroll position but keeps the depth', () => {
    expect(readBlogState({ vertigo: { indexDelta: 1, scrollTop: -5 } })).toEqual({ indexDelta: 1 })
    expect(readBlogState({ vertigo: { indexDelta: 1, scrollTop: NaN } })).toEqual({ indexDelta: 1 })
  })
})

describe('writeBlogState', () => {
  it('preserves keys another writer owns', () => {
    // The state object belongs to the document, not to this feature.
    const next = writeBlogState({ other: 'keep me' }, { indexDelta: 1 })
    expect(next).toEqual({ other: 'keep me', vertigo: { indexDelta: 1 } })
  })

  it('round-trips through readBlogState', () => {
    const written = writeBlogState(null, { indexDelta: 3, scrollTop: 120 })
    expect(readBlogState(written)).toEqual({ indexDelta: 3, scrollTop: 120 })
  })
})

describe('depth bookkeeping', () => {
  it('counts one deeper on every push', () => {
    expect(nextIndexDelta({ indexDelta: 0 })).toBe(1)
    expect(nextIndexDelta({ indexDelta: 1 })).toBe(2)
  })

  it('treats a push from nowhere as the first step in', () => {
    expect(nextIndexDelta(null)).toBe(1)
  })

  it('unwinds to the index rather than pushing a new one', () => {
    // THE REGRESSION THIS PREVENTS: pushing a fresh /blog gives
    // Murcia -> /blog -> /blog/article -> /blog, and one back() out of the blog
    // then lands on the article.
    expect(stepsBackToIndex({ indexDelta: 1 })).toBe(1)
    expect(stepsBackToIndex({ indexDelta: 2 })).toBe(2)
  })

  it('has nowhere to unwind to on the index itself', () => {
    expect(stepsBackToIndex({ indexDelta: 0 })).toBe(0)
  })

  it('reports no index behind a deep-linked article', () => {
    // The caller must REPLACE to /blog. Pushing would add an entry that
    // swallows the reader's next attempt to leave.
    expect(stepsBackToIndex(null)).toBeNull()
  })

  it('leaves the blog from one past the index, wherever it is called from', () => {
    // From the index this is a plain back(), which is the case the artboards
    // draw. From an article it steps over the index too.
    expect(stepsBackToScene({ indexDelta: 0 })).toBe(1)
    expect(stepsBackToScene({ indexDelta: 1 })).toBe(2)
    expect(stepsBackToScene({ indexDelta: 2 })).toBe(3)
  })

  it('reports nothing to go back to when the blog was never pushed', () => {
    expect(stepsBackToScene(null)).toBeNull()
  })

  it('returns the reader to the scene after a full journey', () => {
    // The acceptance sequence, walked as pure arithmetic:
    // scene -> index -> article -> back to index -> back to scene.
    const index = { indexDelta: 0 }
    const article = { indexDelta: nextIndexDelta(index) }
    expect(article.indexDelta).toBe(1)
    expect(stepsBackToIndex(article)).toBe(1)
    // Having unwound, we are on the index entry again, not on a fourth entry.
    expect(stepsBackToScene(index)).toBe(1)
  })
})
