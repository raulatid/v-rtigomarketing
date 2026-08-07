/**
 * Editorial content for the interactive districts.
 *
 * Deliberately free of three.js, world coordinates and Blender identifiers: this
 * is copy, and it is the shape a CMS would later provide. Everything that binds
 * a district to the asset or to a camera decision lives in
 * `src/scene/cityDistrictBindings.ts` instead.
 *
 * Keeping the two apart matters because they change for unrelated reasons — copy
 * changes when marketing changes, bindings change when the GLB is re-exported.
 */

export interface DistrictService {
  /**
   * Stable identifier, unique within a district. Used to wire the accordion's
   * `aria-controls` to its region, so duplicates silently break the panel for
   * screen-reader users — `checks/district-flight.ts` asserts uniqueness.
   */
  id: string;
  title: string;
  /** Revealed when the section is opened. One or two short paragraphs. */
  body: string;
}

export interface DistrictContent {
  /** Stable identifier, referenced by a scene binding's `contentId`. */
  id: string;
  /** Short name, used on the projected label and as the panel heading. */
  label: string;
  /**
   * One sentence, and it must stay one sentence: this is what shows at the
   * mobile peek stop, where the sheet is only 40% of the viewport tall.
   */
  summary: string;
  /**
   * The panel's opening paragraph. Separate from `summary` because it has a
   * different job — it is never asked to survive in a 40%-tall sheet, so it can
   * take the room it needs.
   */
  intro: string;
  services: DistrictService[];
}

/**
 * PLACEHOLDER COPY — written to give the layout realistic text lengths to be
 * judged against, not to ship. Vertigo Marketing replaces everything below.
 *
 * Note the bodies are English while `label` is Spanish, matching the Blender
 * naming. That inconsistency is deliberate only in the sense that it was
 * inherited; it should be settled one way or the other before this is seen by
 * anyone outside the team.
 */
export const districtContent: readonly DistrictContent[] = [
  {
    id: 'servicios',
    label: 'Servicios',
    summary: 'What we do for the businesses that live in this city.',
    intro:
      'Every building in this district is a piece of work we do. We handle the ' +
      'parts of a digital presence that compound over time — the ones that are ' +
      'slow to build and hard to buy back once neglected. Pick a service to see ' +
      'how we approach it.',
    services: [
      {
        id: 'seo',
        title: 'SEO',
        body:
          'Search is the only channel that pays you back for work you did months ' +
          'ago. We audit what is holding a site back technically, rebuild the ' +
          'structure search engines actually read, and target the searches your ' +
          'customers make rather than the ones with the biggest numbers next to ' +
          'them. Results are reported against revenue, not rankings.',
      },
      {
        id: 'web-analysis',
        title: 'Web analysis',
        body:
          'Most sites collect far more data than anyone reads. We set up ' +
          'measurement that answers specific questions — where people give up, ' +
          'what they came for and did not find, which pages carry the work — and ' +
          'then we tell you what to change. Analytics that nobody acts on is a ' +
          'cost, not an asset.',
      },
      {
        id: 'content-strategy',
        title: 'Content strategy',
        body:
          'Publishing more is not a strategy. We map what your customers need to ' +
          'know before they buy, find the gaps your competitors have left open, ' +
          'and build a plan you can actually sustain. Fewer pieces, each one ' +
          'earning its place and pointing somewhere.',
      },
      {
        id: 'paid-campaigns',
        title: 'Paid campaigns',
        body:
          'Paid traffic exposes whatever is already true about your offer — it ' +
          'buys attention, it does not buy persuasion. We start with the landing ' +
          'experience, then build campaigns around the segments that convert, and ' +
          'cut the ones that do not quickly rather than defending them.',
      },
      {
        id: 'brand-identity',
        title: 'Brand identity',
        body:
          'A brand is what people can describe about you when you are not in the ' +
          'room. We work out what that should be, then build the system that ' +
          'holds it together — naming, voice, type, colour and the rules for using ' +
          'them — so the tenth touchpoint still looks like the first.',
      },
    ],
  },
];

export function findDistrictContent(id: string): DistrictContent | null {
  return districtContent.find((entry) => entry.id === id) ?? null;
}
