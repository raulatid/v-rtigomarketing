import type { ValidationContext } from 'sanity'
import { cityDistrictBindings } from '../../../src/experiences/murcia/scene/cityDistrictBindings'

/**
 * Two things can still be wrong with a district's service list, and the
 * editor's next step differs, so each says what it is.
 *
 *  - the district's id has no binding at all → it is unreachable in the scene;
 *    nothing here can fix that, so ask;
 *  - a listed service is not published → publish it. The build reads published
 *    documents only, so the reference would not resolve and the stop would go
 *    missing where it would read as an editorial choice.
 *
 * ── What this used to refuse, and why it no longer does ──
 *
 * Until 2026-09-21 it also compared the list against the per-service rows of
 * `cityDistrictBindings.ts` and refused any set that differed, because every
 * service needed a symbol and a figure that only a developer could write there.
 * Those are fields on the service document now, so adding or removing a service
 * is an ordinary editorial act and there is nothing left to refuse.
 *
 * That comparison was also the weaker guard it looked like. It matched SETS OF
 * IDENTIFIERS, so rewriting a service's copy under its existing identifier
 * passed it every time — which is how four of five services came to be drawing
 * figures chosen for copy that no longer existed.
 */
export async function serviceMembership(value: unknown, context: ValidationContext): Promise<true | string> {
  if (!Array.isArray(value)) return true
  const districtId = (context.document?.slug as {current?: string})?.current ?? ''
  const bound = cityDistrictBindings.some((entry) => entry.contentId === districtId)
  if (!bound) {
    return 'Esta sección (identificador «' + districtId + '») no está enlazada con la ciudad todavía, así que no puede publicarse. Avisa al equipo técnico.'
  }

  const ids = value.map((item: {_ref?: string}) => item?._ref).filter((id): id is string => !!id)
  if (ids.length === 0) return true

  let rows: Array<{ _id: string }>
  try {
    // Both drafts and published copies, so an unpublished service can be told
    // apart from a missing one.
    rows = await context.getClient({apiVersion: '2026-08-23'}).fetch<Array<{ _id: string }>>(
      '*[_type == "service" && (_id in $ids || _id in $draftIds)]{_id}',
      {ids, draftIds: ids.map((id) => 'drafts.' + id)},
      {perspective: 'raw'},
    )
  } catch {
    return 'No se han podido comprobar los servicios. Revisa la conexión y vuelve a intentarlo antes de publicar.'
  }

  const published = new Set(rows.filter((row) => !row._id.startsWith('drafts.')).map((row) => row._id))
  const missing = ids.filter((id) => !published.has(id))
  if (missing.length === 0) return true

  // A reference to a document that exists only as a draft, and one to a
  // document that is not there at all, need different answers.
  const drafted = new Set(rows.filter((row) => row._id.startsWith('drafts.')).map((row) => row._id.slice('drafts.'.length)))
  if (missing.every((id) => drafted.has(id))) {
    return missing.length === 1
      ? 'Hay un servicio de la lista que todavía no está publicado. Publícalo primero y vuelve a intentarlo.'
      : 'Hay ' + missing.length + ' servicios de la lista sin publicar. Publícalos primero y vuelve a intentarlo.'
  }
  return 'Hay un servicio en la lista que ya no existe. Quítalo de la lista y vuelve a intentarlo.'
}
