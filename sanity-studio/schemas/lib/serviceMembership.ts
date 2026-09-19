import type { ValidationContext } from 'sanity'
import { cityDistrictBindings } from '../../../src/experiences/murcia/scene/cityDistrictBindings'

/**
 * The district's service list may be reordered, and nothing else.
 *
 * Every service around the lake needs a symbol row in `cityDistrictBindings.ts`,
 * and `cityDistrictBindings.test.ts` fails the build when the two sets differ.
 * Three different situations used to share one message; each now says what is
 * actually wrong, because the editor's next step is different in each:
 *
 *  - the district's id has no binding at all → nothing to do here, ask;
 *  - a listed service is not published → publish it (the build reads published
 *    documents only, so the reference would not resolve);
 *  - the set differs from the bindings → the code has to change first, ask.
 */
interface ServiceRow { _id: string; slug?: string | null }

export async function serviceMembership(value: unknown, context: ValidationContext): Promise<true | string> {
  if (!Array.isArray(value)) return true
  const districtId = (context.document?.slug as {current?: string})?.current ?? ''
  const expected = cityDistrictBindings.find((entry) => entry.contentId === districtId)?.services.map((entry) => entry.serviceId)
  if (!expected) {
    return 'Esta sección (identificador «' + districtId + '») no está enlazada con la ciudad todavía, así que no puede publicarse. Avisa al equipo técnico.'
  }
  const ids = value.map((item: {_ref?: string}) => item?._ref).filter((id): id is string => !!id)
  let rows: ServiceRow[]
  try {
    // Both drafts and published copies, so an unpublished service can be told
    // apart from a missing one.
    rows = await context.getClient({apiVersion: '2026-08-23'}).fetch<ServiceRow[]>(
      '*[_type == "service" && (_id in $ids || _id in $draftIds)]{_id, "slug": slug.current}',
      {ids, draftIds: ids.map((id) => 'drafts.' + id)},
      {perspective: 'raw'},
    )
  } catch {
    return 'No se han podido comprobar los servicios. Revisa la conexión y vuelve a intentarlo antes de publicar.'
  }
  const published = rows.filter((row) => !row._id.startsWith('drafts.'))
  const publishedSlugs = published.map((row) => row.slug).filter((slug): slug is string => typeof slug === 'string')
  if (publishedSlugs.length === expected.length && expected.every((slug) => publishedSlugs.includes(slug))) return true

  const unpublished = rows.filter((row) => row._id.startsWith('drafts.') && !published.some((p) => p._id === row._id.slice('drafts.'.length)))
  if (unpublished.length > 0 && ids.length === expected.length) {
    return 'Hay un servicio de la lista que todavía no está publicado. Publícalo primero y vuelve a intentarlo.'
  }
  return 'Puedes cambiar el orden, pero añadir, sustituir o quitar servicios requiere darles un símbolo en la ciudad. Contacta con el equipo técnico.'
}
