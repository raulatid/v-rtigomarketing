import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'

/**
 * Length bounds for a service, shared by the two mappers that build one.
 *
 * `services.collection.ts` maps a standalone service document and
 * `districts.collection.ts` maps the same fields after dereferencing. Two copies
 * of these numbers is the arrangement where one gets relaxed and the other
 * quietly does not, and the failure shows up as a district that rejects copy its
 * own service document accepted.
 */

// The numbers themselves moved once more, to src/content/editorialBounds.ts,
// when it turned out there was a THIRD copy of them: the Studio's own
// validation, which decides whether the editor may press Publicar at all. This
// file keeps its names — two mappers import them — and stops owning the values.
export const SERVICE_TITLE_MAX = EDITORIAL_BOUNDS.service.title
export const SERVICE_BODY_MAX = EDITORIAL_BOUNDS.service.body
