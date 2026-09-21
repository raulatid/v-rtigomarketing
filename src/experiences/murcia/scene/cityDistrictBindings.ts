/**
 * Binds editorial district content to its scene composition.
 *
 * Separate from the generated content on purpose: where the scene's geometry is
 * and what it is called changes when the GLB is re-exported, not when marketing
 * writes, so it must not be a marketing edit away from moving.
 *
 * The boundary is "does a re-export change it", NOT "is it visual". That
 * distinction was got wrong once — a service's symbol and figure are visual, so
 * they were kept here, and they turned out to belong to whoever writes the
 * copy. See what the rows cost, below.
 *
 * ## What it has bound, in order
 *
 * Until the 2026-09-06 re-export it carried one row per service — a building
 * node, a connection node and an accent colour — because the export shipped a
 * building per service. That export dropped them, and the rows went with them.
 *
 * Until 2026-09-11 it also carried the display district's camera decision: the
 * yaw to land on (45, then 225) and how close to fly (0.78 of rest). The
 * services campus replaced that district (plan 024) and flies its own ring of
 * stops round the lake, taking its heading from wherever the visitor was
 * looking, so neither number has a reader any more. Why the yaw had to turn
 * half round is in git history; it described a plaza no longer in the city.
 *
 * Until 2026-09-21 it also carried one row per service — a symbol and a figure,
 * keyed by the service's slug. That arrangement made an editorial act depend on
 * a code change: a published service with no row produced no shapes, which
 * `parseServicesContent` rejects per DOCUMENT, so ONE unlisted service took the
 * whole campus down to scenery and the build down with it.
 *
 * It also hid the mistake that matters. The rows were keyed by slug and the
 * tests compared SETS of ids, so rewriting a service's copy under its existing
 * slug kept every test green while its figure went on drawing the mechanism the
 * old copy argued. On 2026-09-21 four of five services were in exactly that
 * state, and the only one that made any noise was the fifth, whose slug had
 * changed.
 *
 * Both are Studio fields now, offered as closed lists from
 * `src/content/campusShapes.ts`. The symbol defaults; the figure has no default
 * and may be null, because a figure asserts something about the copy and a
 * symbol does not.
 *
 * ## What it binds now
 *
 * One thing: which district content this city's services section shows. That
 * survives because it is genuinely scene composition — the id is welded to the
 * lake in the GLB, which is why `sanity.config.ts` will not let an editor
 * create or delete the document.
 */

export interface DistrictSceneBinding {
  /** References `DistrictContent.id`. */
  contentId: string;
}

export const cityDistrictBindings: readonly DistrictSceneBinding[] = [
  { contentId: 'servicios' },
];
