import type { ValidationContext } from 'sanity'
import { ORBIT_FILL_ORDER } from '../../../src/experiences/earth/orbit/orbitAssignments'

/**
 * No more published cases than the planet has orbits.
 *
 * The orbits are a fixed, art-directed set: one for the highlighted case and
 * `ORBIT_FILL_ORDER` for the rest. The site does not fail on a seventh case —
 * it fills the orbits in id order and leaves the rest off the globe — which is
 * the quiet kind of wrong: publish «Acme» and it appears, while the client
 * that sorted last alphabetically vanishes, and nothing says so. Refusing the
 * publish here is what makes the order irrelevant: with at most one case per
 * orbit, every published case is on the globe.
 *
 * Counts PUBLISHED cases other than this one. A seventh DRAFT is fine — that is
 * how a replacement gets prepared — and swapping one case for another is
 * unpublish, then publish, which GUIA-EDITOR.md says.
 *
 * The number is the scene's, not a copy: add an orbit to the fill order and the
 * limit moves with it.
 */
export const ORBIT_CAPACITY = ORBIT_FILL_ORDER.length + 1

export async function orbitCapacity(_value: unknown, context: ValidationContext): Promise<true | string> {
  const ownId = String(context.document?._id ?? '').replace(/^drafts\./, '')
  let published: unknown
  try {
    published = await context.getClient({apiVersion: '2026-08-23'}).fetch(
      'count(*[_type == "caseStudy" && !(_id in path("drafts.**")) && _id != $ownId])',
      {ownId},
    )
  } catch {
    return 'No se ha podido comprobar cuántos casos hay publicados. Revisa la conexión y vuelve a intentarlo antes de publicar.'
  }
  if (typeof published !== 'number' || published < ORBIT_CAPACITY) return true
  return (
    'Ya hay ' + published + ' casos publicados y el planeta tiene ' + ORBIT_CAPACITY + ' órbitas: ' +
    'este no aparecería. Para publicarlo, despublica antes otro caso.'
  )
}
