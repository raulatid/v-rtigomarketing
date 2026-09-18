import { useEffect } from 'react'
import { setIfMissing, type ObjectInputProps } from 'sanity'
import { ORBIT_FILL_ORDER } from '../../src/experiences/earth/orbit/orbitAssignments'
import { cityDistrictBindings } from '../../src/experiences/murcia/scene/cityDistrictBindings'
import { slugify } from '../schemas/lib/slug'

export function placement(type: string, slug: string): string | null {
  // Which orbit a case rides is derived from the published collection at
  // build time (orbitAssignmentsFor), so the Studio cannot name it here: the
  // note states the rule instead of a slot.
  if (type === 'caseStudy') return 'Al publicarlo, este caso ocupa un satélite si queda una órbita libre: hay ' +
    (ORBIT_FILL_ORDER.length + 1) + ' y se reparten por orden de identificador, con el caso resaltado siempre en la misma. Los que sobren no aparecen en el planeta.'
  if (type === 'service') return cityDistrictBindings.some((district) => district.services.some((item) => item.serviceId === slug))
    ? 'Este servicio tiene un símbolo asignado en la ciudad y también puede usarse como tema del blog.'
    : 'Este servicio puede usarse como tema del blog. Para incorporarlo a la ciudad, pide al equipo técnico que le asigne un símbolo.'
  return null
}

/** Generate missing internal IDs only. Never rename a previously stored binding. */
export function EditorialDocument(props: ObjectInputProps) {
  const doc = props.value as {_id?: string; _type?: string; name?: string; title?: string; slug?: {current?: string}} | undefined
  const type = doc?._type ?? ''
  const slug = doc?.slug?.current ?? ''
  const source = doc?.name ?? doc?.title ?? ''
  const id = doc?._id ?? ''
  const {onChange, readOnly} = props
  useEffect(() => {
    if (readOnly || doc?.slug != null || !['caseStudy', 'service'].includes(type) || !source.trim() || !id) return
    const timer = setTimeout(() => {
      // Document ID is stable across collaborators and avoids same-title collisions.
      const suffix = id.replace(/^drafts\./, '').replace(/[^a-zA-Z0-9]/g, '').slice(-12).toLowerCase()
      const current = [slugify(source).slice(0, 48).replace(/-+$/, '') || 'contenido', suffix].filter(Boolean).join('-')
      onChange(setIfMissing({_type: 'slug', current}, ['slug']))
    }, 700)
    return () => clearTimeout(timer)
  }, [id, source, type, doc?.slug, onChange, readOnly])
  const note = placement(type, slug)
  return <>
    {note && <p style={{padding: '12px 16px', background: 'var(--card-code-bg-color)', lineHeight: 1.5}}>{note}</p>}
    {props.renderDefault(props)}
  </>
}
