import type { ContentSource } from './source'

/**
 * What the deployed site says about the content it was built from.
 *
 * ── The problem this closes ──
 * Publicar in the Studio fires a webhook, Vercel rebuilds, and if the build
 * fails the previous deployment keeps serving — correctly, silently. Nothing
 * tells the editor. On 2026-09-18 three legal texts were published at 12:20 and
 * the failure surfaced by screenshot, from someone with no Vercel access,
 * a day later.
 *
 * The site cannot report a failed build (a failed build produces no site), but
 * it CAN report what it was built from. `contentUpdatedAt` is the newest
 * `_updatedAt` among the published documents the build read; the Studio asks
 * Sanity the same question live and compares. Anything newer than the stamp
 * is a publish the site has not caught up with — and after a few minutes, one
 * whose build failed. No Vercel token, no API, no configuration anyone could
 * lose: a JSON file beside the site, and a query the Studio already knows how
 * to make. `sanity-studio/components/siteStatusModel.ts` is the other half.
 *
 * ── Through `fetchAll`, on purpose ──
 * One request per type against the existing `ContentSource` rather than a raw
 * query API the source does not have. It reads the live API like everything
 * else (never the CDN — `sanity.ts` says why), so the stamp cannot be fresher
 * than the content it describes.
 *
 * ── `null` when the content did not come from the CMS ──
 * A fixture or seed build is not "up to date with Sanity" in any sense, and a
 * stamp copied from a previous run would say it was. `null` lets the Studio
 * say so out loud.
 */
export interface ContentVersion {
  /** ISO 8601, or null when the build did not read the CMS. */
  contentUpdatedAt: string | null
  /** `sanity`, `fixture` or `seed` — the same word the build log prints. */
  source: string
  /** ISO 8601. A build time, so deliberately NOT part of the generated modules. */
  builtAt: string
}

/** The newest `_updatedAt` across the published documents of `types`, or null. */
export async function latestUpdatedAt(source: ContentSource, types: readonly string[]): Promise<string | null> {
  let latest: string | null = null
  for (const type of types) {
    const records = await source.fetchAll({ type, orderBy: '_updatedAt desc', projection: '{ _updatedAt }' })
    const first = records[0]
    if (first === null || typeof first !== 'object') continue
    const value = (first as { _updatedAt?: unknown })._updatedAt
    if (typeof value !== 'string' || value.length === 0) continue
    if (latest === null || value > latest) latest = value
  }
  return latest
}

export function contentVersionJson(version: ContentVersion): string {
  return JSON.stringify(version, null, 2) + '\n'
}
