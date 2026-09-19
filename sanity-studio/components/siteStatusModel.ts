/**
 * Whether the site has caught up with what the editor published.
 *
 * The other half of `content/lib/contentVersion.ts`: the site publishes the
 * newest `_updatedAt` it was built from; the Studio asks Sanity for every
 * published document newer than that. None means the site is current. Some,
 * a moment old, means a build is running. Some, older than a build ever takes,
 * means the build failed — and the list is the set of documents to look at.
 *
 * Pure, so `tests/editorial.test.ts` can run it against a clock.
 */
export interface ContentVersion {
  contentUpdatedAt: string | null
  source: string
  builtAt: string
}

export interface PublishedAfter {
  _id: string
  _type: string
  label: string
  _updatedAt: string
}

export type SiteStatus =
  /** The site could not be read at all. */
  | { kind: 'unreachable' }
  /** The site was built from fixtures or the seed, not from the CMS. */
  | { kind: 'not-from-cms'; source: string }
  | { kind: 'live'; builtAt: string }
  /** Newer publishes exist and the newest is within the build's usual duration. */
  | { kind: 'updating'; docs: PublishedAfter[]; builtAt: string }
  /** Newer publishes exist and have waited longer than a build takes. */
  | { kind: 'stale'; docs: PublishedAfter[]; builtAt: string }

/**
 * A Vercel build of this site runs the content build, the tests and the blog
 * capture and lands in three to five minutes. Ten is the point past which
 * "still building" stops being the likely reading.
 */
export const UPDATE_GRACE_MS = 10 * 60 * 1000

export function siteStatusFor(version: ContentVersion | null, newer: readonly PublishedAfter[], now: number): SiteStatus {
  if (version === null) return { kind: 'unreachable' }
  if (version.contentUpdatedAt === null) return { kind: 'not-from-cms', source: version.source }
  if (newer.length === 0) return { kind: 'live', builtAt: version.builtAt }
  const docs = [...newer].sort((a, b) => (a._updatedAt < b._updatedAt ? 1 : a._updatedAt > b._updatedAt ? -1 : 0))
  const newestAt = Date.parse(docs[0]._updatedAt)
  if (Number.isFinite(newestAt) && now - newestAt < UPDATE_GRACE_MS) return { kind: 'updating', docs, builtAt: version.builtAt }
  return { kind: 'stale', docs, builtAt: version.builtAt }
}

/** The published documents newer than the site's stamp, newest first. */
export const PUBLISHED_AFTER_QUERY =
  '*[_type in $types && !(_id in path("drafts.**")) && _updatedAt > $since] | order(_updatedAt desc)[0...20]' +
  '{_id,_type,_updatedAt,"label":coalesce(title,name,label,"Sin título")}'

export function parseContentVersion(value: unknown): ContentVersion | null {
  if (value === null || typeof value !== 'object') return null
  const { contentUpdatedAt, source, builtAt } = value as Record<string, unknown>
  if (contentUpdatedAt !== null && typeof contentUpdatedAt !== 'string') return null
  if (typeof source !== 'string' || typeof builtAt !== 'string') return null
  return { contentUpdatedAt: contentUpdatedAt ?? null, source, builtAt }
}
