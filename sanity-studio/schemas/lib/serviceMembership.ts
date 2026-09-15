import type { ValidationContext } from 'sanity'
import { cityDistrictBindings } from '../../../src/experiences/murcia/scene/cityDistrictBindings'

export async function serviceMembership(value: unknown, context: ValidationContext): Promise<true | string> {
  if (!Array.isArray(value)) return true
  const expected = cityDistrictBindings.find((entry) => entry.contentId === (context.document?.slug as {current?: string})?.current)?.services.map((entry) => entry.serviceId)
  if (!expected) return 'La sección necesita configuración técnica antes de publicarse.'
  const ids = value.map((item: {_ref?: string}) => item?._ref).filter((id): id is string => !!id)
  try {
    const slugs = await context.getClient({apiVersion: '2026-08-23'}).fetch<string[]>(
      '*[_id in $ids].slug.current', {ids}, {perspective: 'published'},
    )
    return slugs.length === expected.length && expected.every((slug) => slugs.includes(slug))
      ? true : 'Puedes cambiar el orden, pero añadir, sustituir o quitar servicios requiere actualizar sus símbolos. Contacta con el equipo técnico.'
  } catch {
    return 'No se han podido comprobar los servicios. Revisa la conexión y vuelve a intentarlo antes de publicar.'
  }
}
