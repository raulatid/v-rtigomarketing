/**
 * Length bounds for a service, shared by the two mappers that build one.
 *
 * `services.collection.ts` maps a standalone service document and
 * `districts.collection.ts` maps the same fields after dereferencing. Two copies
 * of these numbers is the arrangement where one gets relaxed and the other
 * quietly does not, and the failure shows up as a district that rejects copy its
 * own service document accepted.
 */

export const SERVICE_TITLE_MAX = 60

/**
 * Bounded high rather than tight. The accordion scrolls, so a long service body
 * is a design judgement rather than a broken layout — the cap exists to catch a
 * whole rendered post body arriving in a field meant for two paragraphs.
 */
export const SERVICE_BODY_MAX = 900
