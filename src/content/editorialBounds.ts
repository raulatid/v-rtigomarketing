/**
 * Every editorial bound that more than one place has to agree on.
 *
 * THE PROBLEM THIS SOLVES is a specific, quiet one. A bound on a piece of CMS
 * copy lived in two files: `sanity-studio/schemas/*.ts`, where it decides
 * whether the editor may press Publicar, and `content/collections/*.ts`, where
 * it decides whether the build accepts what they published. Written twice, they
 * drift — and the drift has a direction. Relax the Studio and the editor
 * publishes copy that fails the next deployment, with the failure landing on
 * whoever ships rather than on whoever wrote it. Relax the build and the Studio
 * refuses text the site would have rendered perfectly well.
 *
 * `content/collections/serviceBounds.ts` already made this argument for two
 * numbers, for two consumers on the same side of the fence. This is the same
 * argument across the fence, for all of them.
 *
 * ── WHY THIS FILE HAS NO IMPORTS, AND MUST NOT GAIN ANY ──
 *
 * It is the ONE module the Sanity Studio reaches out of this package for. The
 * Studio is deliberately its own package with its own dependency tree
 * (`sanity-studio/package.json` says so), and the point of that separation is
 * that nothing of the Studio's may enter the application's bundle. An import in
 * the other direction is only safe while what it reaches is a leaf: a literal
 * table, no types from `./types`, no helpers, nothing that could pull React,
 * three or a DOM global into `sanity build`.
 *
 * `invariants.ts` is the natural-looking home and is the wrong one for exactly
 * that reason — it imports the content types, and the Studio has no business
 * compiling those.
 *
 * ── WHAT BELONGS HERE ──
 *
 * A number with TWO OR MORE consumers. A bound only the build applies
 * (`BODY_BLOCKS_MAX`, the SEO field ceiling) stays where it is applied; it has
 * one definition already and moving it here would only put distance between the
 * rule and the code that runs it. A bound only the Studio applies (the SEO
 * length warnings, `shortTitle`) stays in the schema for the same reason.
 *
 * Values are the editorial contract, not a technical limit — every one of them
 * came from what the layout can hold, and `docs/content/sanity-field-contract.md`
 * is where the reasoning per field lives.
 */

/**
 * The character set and length every content identifier must satisfy.
 *
 * Here rather than in `invariants.ts` for the reason above, and it is the entry
 * that most earns the move: this one had already been COPIED into
 * `sanity-studio/schemas/lib/slug.ts`, character for character, with a comment
 * asking the next person to keep the two in step by hand. The copy existed
 * because the Studio had nothing it could safely import; it does now.
 *
 * Ids reach `aria-controls`, DOM ids and file names, so the character set is
 * narrower than a CMS slug's. A slug containing a space breaks the accordion for
 * screen-reader users and nobody else, which is why it is a bound rather than
 * something a review would catch.
 */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** The 64 the pattern spells as a leading character plus `{0,63}`. */
export const ID_MAX_LENGTH = 64
export const EDITORIAL_BOUNDS = {
  blogPost: {
    title: 120,
    excerpt: 300,
    /** Topics. They become URL segments and filter keys, not prose. */
    tags: 8,
  },
  caseStudy: {
    /**
     * ONE bound, four fields: `name`, `label`, `sector` and `location`. They sit
     * in the same holographic panel column and are cut off by the same edge, so
     * a separate number per field would be four ways of writing one measurement.
     */
    name: 60,
    summary: 400,
    /** One bullet. The count below is how many of them. */
    detailLine: 200,
    details: 4,
    /** EXACTLY this many — the panel has two slots, not "up to" two. */
    metrics: 2,
    metricLabel: 40,
    metricValue: 20,
    chartTitle: 80,
    chartLabel: 24,
    /** Beyond this the points stop being distinguishable at panel width. */
    chartValues: 16,
  },
  district: {
    label: 40,
    /** The mobile peek stop is 40% of the viewport tall. This is what fits. */
    summary: 140,
    intro: 600,
    services: 12,
  },
  legalDoc: {
    title: 80,
  },
  service: {
    title: 60,
    /**
     * Bounded high rather than tight. The accordion scrolls, so a long body is a
     * design judgement rather than a broken layout — the cap exists to catch a
     * whole rendered post body arriving in a field meant for two paragraphs.
     */
    body: 900,
  },
  siteSettings: {
    /** A link's words, in a footer column. */
    label: 24,
    /** A phone number as it is shown, e.g. `+34 968 00 00 00`. */
    display: 40,
    phones: 4,
    copyright: 120,
    successTitle: 60,
    successBody: 240,
  },
} as const
