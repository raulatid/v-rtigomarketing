import type { BlogPost } from '../content/types'

/**
 * The index's topic filter and search, as pure functions.
 *
 * Separated from the component so both can be tested without a DOM, and so the
 * accent rule below is asserted rather than assumed.
 */

/**
 * Comparison key: lower-cased and stripped of diacritics.
 *
 * NOT optional politeness. The site is Spanish, and a reader looking for a post
 * about "Analítica" will type "analitica" — nobody reaches for the accent key
 * mid-search. Without this, the most obvious query for the most obvious topic
 * returns nothing.
 *
 * NFD splits an accented letter into its base plus a combining mark, and the
 * range removes the marks. That folds "ñ" to "n" as well, which is wanted here
 * for the same reason: someone searching for "España" types "espana". It would
 * be wrong for sorting or display, and this value is only ever compared.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * The topics that actually exist, derived from the posts rather than declared.
 *
 * Deriving it means a pill can never filter to nothing: if a topic is on the
 * list, at least one post carries it. A declared list would drift the moment an
 * editor changed a post's topic.
 *
 * Insertion order follows `BLOG_POSTS`, which is `publishedAt desc`, so the
 * topics a reader has most recently been written about come first.
 */
export function topicsOf(posts: readonly BlogPost[]): Map<string, string> {
  const topics = new Map<string, string>()
  for (const post of posts) {
    if (post.category === null) continue
    if (!topics.has(post.category.id)) topics.set(post.category.id, post.category.shortLabel)
  }
  return topics
}

/**
 * Topic and free text, composed.
 *
 * Search looks at the title, the excerpt and the topic label — not the body.
 * Body text would make the whole dataset the index and turn a two-character
 * query into a list of everything; the fields here are the ones a reader is
 * trying to recognise a post by.
 */
export function filterPosts(
  posts: readonly BlogPost[],
  topic: string | null,
  query: string,
): BlogPost[] {
  const needle = foldForSearch(query.trim())
  return posts.filter((post) => {
    if (topic !== null && post.category?.id !== topic) return false
    if (needle === '') return true
    const haystack = foldForSearch(
      [post.title, post.excerpt, post.category?.label ?? '', post.tags.join(' ')].join(' '),
    )
    return haystack.includes(needle)
  })
}
