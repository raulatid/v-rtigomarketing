/**
 * The shapes the UI consumes. Types only — this module has zero runtime cost and
 * must keep it, because it is imported from both experiences and from Node.
 *
 * ── Why this is a module of its own ──
 * Case studies belong to Earth and districts belong to Murcia, and
 * `checks/architecture.ts` forbids either experience importing the other. A
 * shared leaf module is the only legal home for a vocabulary both sides need —
 * the same role `utils/` and `loading/` already play.
 *
 * ── This is the API contract ──
 * The content is generated from Sanity, but these stay the types the UI consumes
 * and the mapping layer maps *into* them, rather than letting a CMS response
 * shape leak into the components. Nothing here knows what `_ref`, `_type`,
 * `slug.current` or a Sanity asset object is — the GROQ projection in each
 * collection is where that vocabulary stops.
 *
 * Textual fields are PLAIN STRINGS: a CMS rich-text field returns markup, and
 * every render path in this repo (JSX text nodes, `textContent`, canvas
 * `fillText`) is safe precisely because no string arriving here is ever markup.
 * Where content genuinely needs structure it arrives as typed BLOCKS instead —
 * never as HTML, and never through `dangerouslySetInnerHTML`.
 *
 * ── The one import, and why it is allowed ──
 * `campusShapes.ts` is a sibling leaf in this same directory and carries no
 * runtime of its own worth the name. Importing its TYPES keeps this module's
 * zero-cost promise intact, and it is what lets a district service name its
 * shapes in the contract rather than as a bare string every consumer re-checks.
 */

import type { CampusFigure, CampusSymbol } from './campusShapes'

/**
 * An image the CMS owns, normalized away from Sanity's asset shape.
 *
 * Four fields, because four have consumers. `aspectRatio` and `dominantColor`
 * are available from Sanity's metadata and are deliberately absent: metadata
 * with no reader is a contract nobody is keeping.
 *
 * NOT used for case-study logos. Those are mirrored into `public/logos/` and stay
 * a bare path string — the brand atlas needs the URL and nothing else, and its
 * accessible name comes from `CaseStudy.name`.
 */
export interface ImageMedia {
  /** Absolute CMS CDN url, or a local path when the asset was mirrored. */
  src: string
  /** Required. An image whose meaning is decorative should not be in the CMS. */
  alt: string
  width: number
  height: number
  /**
   * Optional visible caption, rendered in a `<figcaption>`.
   *
   * NOT a second `alt`, and the distinction is why it is a separate field
   * rather than a reuse. `alt` REPLACES the image for someone who cannot see
   * it; a caption is read BESIDE the image by everyone. Serialising `alt` into
   * a figcaption announces the same sentence twice to a screen reader and hands
   * a sighted reader a description of what they are already looking at.
   */
  caption?: string
}

export interface SitePhone {
  /**
   * Optional short label shown to the LEFT of the number — a city, usually.
   *
   * Bare: "Madrid", never "Madrid:". The colon is the renderer's, so it cannot
   * be forgotten on one entry and doubled on another. Absent means the number
   * stands on its own, which is the shape every phone had before 2026-09-04.
   */
  label?: string
  /** What the visitor reads, formatted for reading aloud. */
  display: string
  /** What the `tel:` link dials — digits and `+`, no spaces. */
  tel: string
}

/**
 * The handful of global values an editor owns: how to reach the agency, and
 * whose name is on the footer.
 *
 * A SINGLETON, enforced twice. Sanity presents one document and refuses to make
 * a second; the build independently asserts that exactly one arrived, because
 * Studio validation is a convenience and a build assertion is a guarantee. Only
 * that pair makes `SITE_SETTINGS[0]` in `site.ts` an honest read.
 *
 * Deliberately not a key/value bag. A global value earns a field here when it is
 * genuinely editorial; anything else is configuration and belongs in code.
 */
export interface SiteSettings {
  cookieCopy?: import('./cookieCopy').CookieCopy
  /** Fixed. There is one of these, and it is called this. */
  id: string
  phones: SitePhone[]
  /**
   * Where a form submission is emailed. Described to the editor as "la
   * dirección a la que llegan los mensajes", and read by `server/recipient.ts`.
   */
  contactEmail: string
  /**
   * The client's public booking page, when they have given us one.
   *
   * OPTIONAL, and the only optional field on this record. The others have
   * either always existed or carry a shipped fallback; there is no sensible
   * default for somebody else's calendar, so absence is a real state and the
   * contact dialog renders no button for it.
   *
   * Deliberately NOT tied to a platform. The client books on Calendly today and
   * is switching; the build holds this to the SHAPE of a booking link — https,
   * no credentials, a path beyond the origin — so the switch is a paste into
   * the Studio rather than a deploy. See `isBookingUrl` in invariants.ts.
   */
  bookingUrl?: string
  /**
   * What the button that opens `bookingUrl` says.
   *
   * Required here but optional in the CMS: the mapper substitutes the shipped
   * wording when the field is blank, exactly as it does for the confirmation
   * copy below, so by the time a record reaches this type it always has words
   * on it. Editable because the client may want the button to name whatever
   * platform they land on, or to say something other than "book".
   */
  bookingLabel: string
  copyright: string
  /**
   * What the panel says once a submission has genuinely been delivered.
   *
   * Editorial rather than configuration, by the test this file's header sets:
   * "te responderemos en menos de 24 horas" is a promise about the client's own
   * working week, and the alternative to a field is a deploy for a sentence.
   * Four flat strings rather than a nested object, because the GROQ projection
   * and the mapper are flat and nesting buys nothing here.
   */
  auditSuccessTitle: string
  auditSuccessBody: string
  contactSuccessTitle: string
  contactSuccessBody: string
  /**
   * The options of the audit form's "Rango de facturación" dropdown, in order.
   * Each string is both what the visitor reads and what is submitted — nothing
   * parses it, and the notification email shows it as picked. Never empty: the
   * mapper substitutes placeholder ranges when the CMS has none.
   */
  revenueRanges: string[]
  /**
   * The options of the audit form's "Presupuesto mensual" dropdown, in order.
   * The same arrangement as `revenueRanges`: the string is both the option and
   * the submitted value, and the mapper substitutes placeholders when the CMS
   * has none.
   */
  budgetRanges: string[]
}

/**
 * Structured copy, for the few places plain strings are genuinely not enough.
 *
 * ── Why this is not HTML ──
 * The rule that arbitrary CMS HTML must never reach a renderer stays exactly as
 * it was. This is not a relaxation of it: these are typed blocks, and the
 * renderer switches on `kind` to pick a component. There is no `dangerously`
 * anything, and a block type the vocabulary does not name cannot appear here
 * because ingestion rejects it and fails the build.
 *
 * ── Why not just `string[]` ──
 * Legal copy reasonably needs headings, lists and a link to the privacy
 * authority. Storing it as paragraphs would mean either shipping a document that
 * cannot say what it needs to, or a content migration later — and a content
 * migration on legal text is the kind nobody wants to be responsible for.
 */
export type TextMark = 'strong' | 'em'

export interface TextSpan {
  text: string
  marks?: TextMark[]
  /** `https:` or `mailto:` only, asserted at ingest. */
  href?: string
}

export interface ParagraphBlock {
  kind: 'paragraph'
  spans: TextSpan[]
}

export interface HeadingBlock {
  kind: 'heading'
  /** 2 or 3. The panel already owns `h1` and the document title is the `h2`. */
  level: 2 | 3
  spans: TextSpan[]
}

export interface ListBlock {
  kind: 'list'
  ordered: boolean
  items: TextSpan[][]
}

export interface QuoteBlock {
  kind: 'quote'
  spans: TextSpan[]
}

/**
 * What a legal document may contain. No images, no embeds, no video, no quotes —
 * a privacy notice that needs an embedded video is not a privacy notice.
 */
export type LegalBlock = ParagraphBlock | HeadingBlock | ListBlock

export interface LegalDoc {
  /** `terminos` or `aviso`. The union lives in `site.ts`; see the note there. */
  id: string
  title: string
  body: LegalBlock[]
}

export interface ImageBlock {
  kind: 'image'
  image: ImageMedia
}

/**
 * Editorial video, modelled and not built.
 *
 * There is no transcoding pipeline and no player, and this migration is not the
 * place to add either. What it IS the place for is the schema boundary: an
 * editor who needs video later should not force a content migration to get it.
 */
export interface VideoBlock {
  kind: 'video'
  src: string
  poster?: ImageMedia
}

/**
 * A third-party embed, by PROVIDER rather than by markup.
 *
 * The provider is an allowlist and the url is validated against that provider's
 * hosts at ingest, so a renderer builds its own iframe from known-good parts.
 * An `html` field carrying whatever an editor pasted is the thing this exists
 * to make impossible.
 */
export interface EmbedBlock {
  kind: 'embed'
  provider: 'youtube' | 'vimeo'
  url: string
}

/**
 * What a blog post may contain.
 *
 * Richer than `LegalBlock` because a blog post reasonably is. Rendered since
 * `adr/013` by `src/blog/PostBody.tsx`, which handles all seven kinds and ends
 * in an exhaustiveness assertion — so adding a member here is a type error there
 * rather than a block that silently renders nothing.
 *
 * The generated module is still reachable only through the lazy blog chunk. The
 * architecture rule that used to forbid importing it at all now forbids
 * importing it STATICALLY from `src/main.tsx`, for the reason the original rule
 * gave: a static import puts every article body on the initial load of `/`,
 * and the dataset grows with the article library rather than with the code.
 */
export type BlogBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | ImageBlock
  | VideoBlock
  | EmbedBlock

/**
 * The topic a post belongs to: the eyebrow above the title, and the pills on the
 * blog index.
 *
 * A REFERENCE to a service, dereferenced by the GROQ projection, not a free
 * string and not an enum. Three consequences, all of them the point:
 *
 * - the set of topics is CMS-owned, so no list of category identifiers is
 *   duplicated between the Studio, the build and the UI;
 * - Sanity enforces that the target exists, so a topic can never name a service
 *   that was deleted;
 * - the pills on the index and the buildings in the Murcia services district are
 *   the same five things, because they are literally the same documents.
 */
export interface BlogCategory {
  /** A `Service.id`. Also the `?tema=` query value. */
  id: string
  /** The full service title, e.g. "Estrategia de contenidos". */
  label: string
  /**
   * What the pills and card eyebrows show, e.g. "Contenidos".
   *
   * Falls back to `label` at ingest when the editor has not written one, so a
   * consumer never has to decide. Editorial rather than derived: no rule turns
   * "Identidad de marca" into "Marca".
   */
  shortLabel: string
}

/**
 * What a crawler and a social scraper are told about a post.
 *
 * EVERY FIELD IS RESOLVED AT INGEST and none of them is null. The fallbacks —
 * title from the post title, description from the excerpt, image from the cover
 * and then from the site default — are applied in the mapper rather than in the
 * renderer, following `DEFAULT_BRAND_COLOR` in `invariants.ts`: resolved once,
 * in the content build, so every consumer reads a guaranteed value.
 *
 * That guarantee is load-bearing downstream. The static blog shells emitted by
 * `vite.config.ts` are verified to carry exactly one `og:image`, which is only
 * a check worth making because `image` cannot be absent.
 */
export interface BlogSeo {
  /** Never empty. `seoTitle`, else the post title. */
  title: string
  /** Never empty. `metaDescription`, else the excerpt cut at a word boundary. */
  description: string
  /** Never null. `ogImage`, else `cover`, else the site-wide default. */
  image: ImageMedia
}

export interface BlogPost {
  id: string
  title: string
  /** Plain text. The card and the meta description, not the opening paragraph. */
  excerpt: string
  cover: ImageMedia | null
  /** ISO 8601, from Sanity's datetime field. */
  publishedAt: string
  tags: string[]
  body: BlogBlock[]
  /**
   * NULLABLE, and deliberately not defaulted.
   *
   * The Studio requires it, so every post written from now on has one. Posts
   * that predate the field do not, and the honest options were to fail the build
   * on live content, to guess from `tags[0]`, or to say so. Guessing was
   * rejected: a category carries a visible label, and `map` has no access to the
   * services collection to check that a guess names a real one — `Collection`
   * gives `map` one record at a time on purpose. A post with no category shows
   * no eyebrow and appears under no pill, which is visibly incomplete rather
   * than confidently wrong.
   *
   * MIGRATION STATE, not a design. Once the dataset is filled in, this becomes
   * `BlogCategory` and the projection stops coalescing.
   */
  category: BlogCategory | null
  /**
   * Minutes, computed from `body` at build time — never authored.
   *
   * An authored number drifts silently the moment the body is edited and nobody
   * notices, which is the same argument `ImageMedia` makes for not carrying
   * metadata no one reads. A derivation the build can do is not editorial.
   */
  readingTime: number
  seo: BlogSeo
}

export interface CaseStudyMetric {
  label: string
  value: string
}

/**
 * Four chart shapes, cycled across the cases. The renderer normalises each
 * series to its own min/max, so units do not matter and only the shape does.
 */
export type CaseChartType = 'line' | 'bars' | 'area' | 'donut'

export interface CaseChart {
  type: CaseChartType
  /** Short caption shown above the chart. */
  title: string
  /** Series values. For 'donut' these are shares of a whole. */
  values: number[]
  /** Per-value labels: x-axis ticks for 'bars', legend entries for 'donut'. */
  labels?: string[]
}

/**
 * NO `orbitId` HERE, deliberately. Which case occupies which orbit is scene
 * composition, not editorial content — `experiences/earth/orbit/orbitAssignments.ts`
 * derives it beside the presets it refers to, the same way
 * `cityDistrictBindings.ts` binds district copy to city geometry. The one
 * editorial input to that derivation is `highlighted`, below.
 *
 * Putting an orbit id back would let a CMS author decide where a client
 * appears in a hand-tuned composition, and would re-create the failure that
 * derivation exists to prevent: an ordering the scene did not choose.
 */
export interface CaseStudy {
  /** Stable identifier. Referenced by an `OrbitAssignment.caseId`. */
  id: string
  /**
   * The highlighted case — the Studio's «caso de éxito resaltado».
   *
   * EXACTLY ONE case carries `true`; the content build fails otherwise
   * (`highlightedCaseProblems`). It is the satellite whose halo breathes
   * brighter in the overview and the hover tutorial's target, and for that it
   * always rides `orbit-02`, the one orbit that is on screen the whole way
   * round at every supported viewport (`satelliteVisibility.test.ts`).
   */
  highlighted: boolean
  /**
   * NOT CURRENTLY RENDERED. This was the text drawn on the old flat 3D badge,
   * which the satellite GLB and the brand atlas replaced — the atlas draws
   * `name`. Kept because it is a reasonable short-form field for an API to
   * carry, but nothing reads it today.
   */
  label: string
  /** Full brand name, shown as the panel title. */
  name: string
  /**
   * URL of the brand's ISOTYPE — the symbol alone, without the wordmark.
   *
   * This is the resting state of the satellite's brand panel, and therefore the
   * artwork that is on screen the whole time the overview is, across all six
   * satellites at once. It matters more than `logo`, which only appears under
   * selection.
   *
   * Same storage rules as `logo`: a path under /public, mirrored from the CMS.
   *
   * PAIRED WITH `logo`. Either both are set or both are null — the content build
   * fails a case study that declares one without the other, so nothing
   * downstream has to handle a panel that would unfold from real artwork into a
   * drawn placeholder. See content/collections/caseStudies.collection.ts.
   *
   * Artwork requirements are in docs/earth/logo-spec.md: square, 512–1024px,
   * transparent, trimmed tight, light/reverse variant.
   */
  isotype: string | null
  /**
   * URL of the real company logo — the full horizontal lockup, symbol plus
   * wordmark. Drawn into this case's cell of the logo atlas and revealed when
   * the brand panel unfolds under selection.
   *
   * A path under /public today (`/logos/mango.webp`), and a path under /public
   * tomorrow too — the media pipeline mirrors CMS uploads into `public/logos/`
   * rather than hotlinking them, so this stays same-origin.
   *
   * Null, a 404, or an image that fails CORS all leave the generated plate (mark
   * disc + wordmark) in place. The panel is never blank.
   *
   * Artwork requirements are in docs/earth/logo-spec.md — the short version is
   * 1600x800 WebP, transparent, trimmed tight with NO built-in padding, and the
   * light/reverse variant, because the panel is a dark holographic surface.
   */
  logo: string | null
  /**
   * Accent colour for the holographic orbit panel — the mark, the wordmark and
   * the pane wash are all drawn from it. CSS hex string, `#rrggbb`.
   *
   * `createBrandAtlas` parses this as hex; anything else yields
   * `rgb(NaN, NaN, NaN)`, which canvas silently ignores.
   */
  brandColor: string
  /** The `sector · location · year` line. Each may be empty; the panel joins the ones that are not. */
  sector: string
  location: string
  year: string
  summary: string
  /** Bullet-point body copy under the summary. Four short lines each. */
  details: string[]
  /** Zero to `EDITORIAL_BOUNDS.caseStudy.metrics`. The row wraps, and hides when empty. */
  metrics: CaseStudyMetric[]
  /** Null when the case has nothing to plot; the panel leaves the block out. */
  chart: CaseChart | null
}

/**
 * One thing the agency does.
 *
 * A first-class CMS document rather than a row nested inside a district: a
 * service is edited on its own, and a district REFERENCES the ones it presents.
 * `SERVICES` is emitted as its own collection so a future services page does not
 * have to reach into a district to find them.
 *
 * Three fields, matching what the accordion renders. The migration plan sketches
 * `shortDescription`, `media` and presentation metadata; those arrive when
 * something displays them, because a field with no reader is a contract nobody
 * is keeping.
 */
export interface Service {
  /**
   * Stable identifier. Keys the service to its symbol in
   * `scene/cityDistrictBindings.ts` (every service needs a row there — the
   * binding test fails otherwise). A duplicate is refused by the campus's
   * content parser (`campus/content/servicesContent.ts`), which rejects the
   * whole set rather than show one of two services.
   */
  id: string
  /** On the building's projected label and as the panel heading. */
  title: string
  /**
   * The panel body once the building is selected. One or two short paragraphs,
   * separated by a blank line.
   */
  body: string
}

/**
 * A service as it appears inside a district.
 *
 * The district's GROQ projection dereferences the service documents into this:
 * the service's own fields, plus the colour its particles take in the campus.
 */
export type DistrictService = Service & {
  /**
   * The colour mixed with white in this service's particles, `#rrggbb`. The
   * Studio field is optional; empty resolves, in the content build, to the
   * district's `particleColor`, so this is always a hex string.
   */
  particleColor: string
  /**
   * What this service's particle figure draws, in one line: the legend the
   * campus plate shows once the figure has formed. Optional in the Studio;
   * null when empty, and then the plate shows no legend.
   */
  figureCaption: string | null
  /**
   * The symbol this service's particles form at rest, a name from
   * `campusShapes.ts`. Optional in the Studio; empty resolves, in the content
   * build, to `DEFAULT_CAMPUS_SYMBOL`, so this is always a name.
   */
  symbol: CampusSymbol
  /**
   * What that symbol turns into, a name from `campusShapes.ts`. Optional in the
   * Studio and NULL when empty — deliberately with no default, because a figure
   * draws the mechanism its copy argues and one nobody chose would draw a
   * mechanism nobody wrote. Null means the symbol stays a symbol.
   */
  figure: CampusFigure | null
  /**
   * The plate's «Qué medimos»: the names of what gets measured, not values.
   * Optional in the Studio; empty when none, and then the block is not drawn.
   */
  measures: string[]
}

export interface DistrictContent {
  /** Stable identifier, referenced by a scene binding's `contentId`. */
  id: string
  /** Short name, used as the panel eyebrow ("Servicios · 2 / 5"). */
  label: string
  /**
   * Currently unread. It was the district panel's one-line lead when the
   * district was picked as a whole; since one service per building
   * (2026-08-27) the panel shows a single service and nothing renders this.
   * Kept in the contract until the Sanity schema is revisited.
   */
  summary: string
  /** Currently unread, for the same reason as `summary`. */
  intro: string
  /**
   * The colour mixed with white in the campus particles on entering, `#rrggbb`.
   * Empty in the Studio resolves to DEFAULT_PARTICLE_COLOR in the content build.
   */
  particleColor: string
  /** The tour order: prev/next and tab order follow this array. */
  services: DistrictService[]
}
