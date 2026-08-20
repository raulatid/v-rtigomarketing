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
 * When the content is generated from WordPress, these stay the types the UI
 * consumes and the mapping layer maps *into* them, rather than letting a REST
 * response shape leak into the components. The mapper emits PLAIN STRINGS only:
 * WordPress returns `title.rendered` / `content.rendered` as HTML, and every
 * render path in this repo (JSX text nodes, `textContent`, canvas `fillText`)
 * is safe precisely because no string arriving here is ever markup.
 */

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

export interface DistrictService {
  /**
   * Stable identifier, unique within a district. Used to wire the accordion's
   * `aria-controls` to its region, so duplicates silently break the panel for
   * screen-reader users — `checks/district-flight.ts` asserts uniqueness.
   */
  id: string
  title: string
  /** Revealed when the section is opened. One or two short paragraphs. */
  body: string
}

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
