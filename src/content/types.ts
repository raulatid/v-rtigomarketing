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
 */

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
 * composition, not editorial content — it lives in
 * `experiences/earth/orbit/orbitAssignments.ts` beside the presets it refers to,
 * the same way `cityDistrictBindings.ts` binds district copy to city geometry.
 *
 * Putting it back would let a CMS author decide where a client appears in a
 * hand-tuned composition, and would re-create the failure that table exists to
 * prevent: an ordering the scene did not choose.
 */
export interface CaseStudy {
  /** Stable identifier. Referenced by an `OrbitAssignment.caseId`. */
  id: string
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
   * URL of the real company logo, drawn into this case's cell of the brand
   * atlas. A path under /public today (`/logos/mango.webp`), and a path under
   * /public tomorrow too — the media pipeline mirrors CMS uploads into
   * `public/logos/` rather than hotlinking them, so this stays same-origin.
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
  sector: string
  location: string
  year: string
  summary: string
  /** Bullet-point body copy under the summary. Four short lines each. */
  details: string[]
  /** Exactly two — the panel's metric row is a fixed two-up grid. */
  metrics: [CaseStudyMetric, CaseStudyMetric]
  chart: CaseChart
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
   * Stable identifier. Used to wire the district accordion's `aria-controls` to
   * its region, so duplicates silently break the panel for screen-reader users —
   * `checks/district-flight.ts` asserts uniqueness.
   */
  id: string
  title: string
  /** Revealed when the section is opened. One or two short paragraphs. */
  body: string
}

/**
 * A service as it appears inside a district panel.
 *
 * The same shape by design: the district's GROQ projection dereferences the
 * service documents into exactly this, so promoting services to their own
 * documents changed nothing the UI can observe.
 */
export type DistrictService = Service

export interface DistrictContent {
  /** Stable identifier, referenced by a scene binding's `contentId`. */
  id: string
  /** Short name, used on the projected label and as the panel heading. */
  label: string
  /**
   * One sentence, and it must stay one sentence: this is what shows at the
   * mobile peek stop, where the sheet is only 40% of the viewport tall.
   */
  summary: string
  /**
   * The panel's opening paragraph. Separate from `summary` because it has a
   * different job — it is never asked to survive in a 40%-tall sheet, so it can
   * take the room it needs.
   */
  intro: string
  services: DistrictService[]
}
