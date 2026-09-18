import type { ValidationContext } from 'sanity'

/**
 * There is exactly ONE highlighted case at a time.
 *
 * The highlighted case is the satellite whose halo breathes brighter in the
 * overview and the one the hover tutorial points at. Two of them would give the
 * tutorial two targets; none would leave the visitor with no worked example.
 * This rule guards the first half here, next to the switch, so the editor finds
 * out before publishing rather than from a failed deploy; the content build is
 * what actually enforces both halves.
 *
 * Only PUBLISHED documents count as "another highlighted case". A colleague's
 * unpublished draft must not block this one, and this document's own published
 * version is excluded by id so re-saving the current highlight stays valid.
 */
export async function highlightedCaseUnique(value: unknown, context: ValidationContext): Promise<true | string> {
  if (value !== true) return true
  const ownId = String(context.document?._id ?? '').replace(/^drafts\./, '')
  try {
    const others = await context.getClient({apiVersion: '2026-08-23'}).fetch<string[]>(
      '*[_type == "caseStudy" && highlighted == true && _id != $ownId].name',
      {ownId},
      {perspective: 'published'},
    )
    if (others.length === 0) return true
    return (
      'Ya hay un caso resaltado: «' + others[0] + '». Solo puede haber uno. ' +
      'Desmarca primero ese caso y vuelve a intentarlo.'
    )
  } catch {
    return 'No se ha podido comprobar si hay otro caso resaltado. Revisa la conexión y vuelve a intentarlo antes de publicar.'
  }
}
