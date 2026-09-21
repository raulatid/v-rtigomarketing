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
 * A number with TWO OR MORE consumers. A bound only the build applies (the SEO
 * field ceiling) stays where it is applied; it has one definition already and
 * moving it here would only put distance between the rule and the code that
 * runs it. A bound only the Studio applies (the SEO length warnings,
 * `shortTitle`) stays in the schema for the same reason. The blog block cap
 * looked like the first kind and was written three times (2026-09-19 audit).
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

/**
 * What a district's `particleColor` resolves to when the Studio field is left
 * empty: the site's accent blue (`--accent`, siteHeader.css). An empty service
 * colour resolves to its district's, so an untouched dataset is blue and white.
 *
 * Here for the same reason as ID_PATTERN: the content build resolves to it and
 * the Studio's colour picker starts from it, and the two must be one value.
 */
export const DEFAULT_PARTICLE_COLOR = '#1c67ff'

/** The 64 the pattern spells as a leading character plus `{0,63}`. */
export const ID_MAX_LENGTH = 64

/**
 * Where a blog embed's URL may point, per provider. The renderer builds its
 * own card from these parts, which is only safe while the host really is the
 * provider's — so the build checks the parsed hostname against this list, and
 * the Studio checks the same list while the editor is pasting.
 */
export const EMBED_HOSTS = {
  youtube: ['www.youtube.com', 'youtube.com', 'youtu.be'],
  vimeo: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
} as const
export const EDITORIAL_BOUNDS = {
  blogPost: {
    title: 120,
    excerpt: 300,
    /** Topics. They become URL segments and filter keys, not prose. */
    tags: 8,
    /** Blocks of any kind — paragraphs, headings, images, embeds. A very long article, not a limit anyone reaches writing. */
    bodyBlocks: 400,
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
    /** Up to this many; the row is a flex that shares its width, and none hides the row. */
    metrics: 2,
    /** A chart with fewer points is a dot; a case with nothing to plot leaves the chart out. */
    chartValuesMin: 2,
    /**
     * One brand-mark file. The media mirror fetches every one on a cold build,
     * and the Studio asks the asset's size before Publicar — a cap only the
     * build knew about was a failed deployment for a PNG that looked fine.
     */
    brandMarkBytes: 4 * 1024 * 1024,
    /**
     * The box inside its atlas cell that each brand mark is contain-fitted into,
     * in cell pixels. `createBrandAtlas.ts` owns the cells and the padding —
     * 512×512 padded by (40, 72) and 1024×512 padded by (64, 72) — and
     * `createBrandAtlas.test.ts` asserts these two agree with it, because that
     * module is under `src/experiences/` and neither the Studio nor `content/`
     * may import it.
     *
     * Restated here because BOTH of them need it and got it wrong: the Studio
     * advised against 432×432 and 900×400, and the build's comment repeated
     * them, for a fortnight after `PAD_Y` was unified at 72. Two hand-copies of
     * a derived number drifting from their source is precisely this table's
     * subject.
     */
    brandMarkBox: {
      isotype: { width: 432, height: 368 },
      logo: { width: 896, height: 368 },
    },
    /**
     * How much of the box a mark must still occupy, in cell pixels, on BOTH
     * axes once it has been contain-fitted.
     *
     * THE RULE THAT REPLACED AN ASPECT BAND (2026-09-21). The isotype used to be
     * refused outside 3:4–4:3, then 3:4–2:1, and each time a real brand arrived
     * just outside it the number moved — because the aspect was a proxy for the
     * thing anyone actually cares about, which is how tall the mark ends up.
     * Stating that directly stops the ratchet and lets the message name the size
     * the editor will get.
     *
     * 144 is where a symbol stops being a symbol. Past 432/144 = 3:1 the mark is
     * a strip about 8px tall on the ~30px resting panel; at 2.35:1, the widest
     * real asset so far, it draws 432×184 and reads.
     *
     * The isotype only. The logo keeps an aspect band, because its bound is not
     * legibility — a lockup has to be HORIZONTAL to make sense of a panel that
     * unfolds to 2:1, and a square one is not a lockup however large it draws.
     */
    brandMarkMinDrawn: 144,
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
    /**
     * A SAFETY NET, not an editorial length. The panel scrolls, so a long legal
     * text is a design judgement the editor makes, not a broken layout — and
     * legal copy only ever grows (a clause per regulation, never fewer). It was
     * 120, written here and again in `LEGAL_POLICY`, and «Términos» reached 86
     * of them on 2026-09-18 without anyone being told. The number now exists
     * only to stop a whole pasted PDF; the Studio advises on length in words,
     * where an editor can act on it, and never refuses on that account.
     */
    bodyBlocks: 600,
  },
  service: {
    title: 60,
    /**
     * Bounded high rather than tight. The accordion scrolls, so a long body is a
     * design judgement rather than a broken layout — the cap exists to catch a
     * whole rendered post body arriving in a field meant for two paragraphs.
     */
    body: 900,
    /** One line under the copy on the campus plate, naming what the particle figure draws. */
    figureCaption: 110,
    /** One entry of «Qué medimos». A metric's name, not a sentence. */
    measure: 48,
    /** Entries of «Qué medimos». More than this pushes the plate into the figure on a phone. */
    measures: 3,
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
    /** One option in the audit form's billing dropdown. The same number
        `server/validate.ts` caps the submitted value at. */
    revenueRange: 60,
    /** Options in that dropdown. More than this is a list nobody reads. */
    revenueRanges: 8,
    /** One option in the audit form's monthly-budget dropdown. Same number
        `server/validate.ts` caps the submitted value at, as for the range. */
    budgetRange: 60,
    budgetRanges: 8,
  },
} as const
