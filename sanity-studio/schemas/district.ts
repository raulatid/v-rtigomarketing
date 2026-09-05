import { PinIcon } from '@sanity/icons/Pin'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'
import { slugOptions, slugValidation } from './lib/slug'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'

/**
 * The lengths this schema refuses, shared with the content build.
 *
 * They used to be literals here and literals again in
 * `content/collections/*.collection.ts`, which is the arrangement where one
 * gets relaxed and the other quietly does not — and the editor finds out by
 * having a document accepted here and rejected by the next deployment. The
 * numbers live in one table now; see `src/content/editorialBounds.ts`,
 * including why that module has no imports and must not gain any.
 *
 * The messages interpolate rather than restate. A message that says "como
 * máximo 140" beside a rule that allows 200 is worse than no message.
 */
const BOUNDS = EDITORIAL_BOUNDS.district

/**
 * A district — the copy behind one interactive area of the city.
 *
 * ── What is NOT here ──
 * No Blender node names, no camera yaw, no world rectangles. Those live in
 * `src/experiences/murcia/scene/cityDistrictBindings.ts` and change when the GLB
 * is re-exported, not when marketing writes.
 *
 * ── Why an editor cannot create one ──
 * The identifier must match a `contentId` in that file: a district whose id
 * nothing binds is unreachable in the scene. So there is exactly one, it is
 * welded to the 3D city, and `sanity.config.ts` removes "create", "duplicate"
 * and "delete" for this type. The editor edits its text and nothing else.
 */
export const district = defineType({
  name: 'district',
  title: 'Distrito',
  icon: PinIcon,
  type: 'document',
  fieldsets: [
    {
      name: 'distrito',
      title: 'Distrito',
      description: 'La zona de la ciudad y el texto que se abre al hacer clic en ella.',
    },
    {
      name: 'servicios',
      title: 'Servicios',
      description: 'Los servicios que se despliegan dentro del panel, en este orden.',
    },
    TECH_FIELDSET,
  ],
  fields: [
    defineField({
      name: 'label',
      title: 'Nombre',
      description: 'El nombre de la zona, tal y como aparece sobre la ciudad. Ejemplo: Servicios.',
      type: 'string',
      fieldset: 'distrito',
      validation: (rule) => [
        rule.required().error('Escribe el nombre del distrito.'),
        rule.max(BOUNDS.label).error(`Demasiado largo: como máximo ${BOUNDS.label} caracteres.`),
      ],
    }),
    defineField({
      name: 'summary',
      title: 'Resumen',
      description: 'Una sola frase, hasta 140 caracteres. Es lo primero que se lee en el móvil.',
      type: 'text',
      rows: 2,
      fieldset: 'distrito',
      validation: (rule) => [
        rule.required().error('Escribe una frase de resumen.'),
        rule.max(BOUNDS.summary).error(
          `Demasiado largo: en el móvil solo caben ${BOUNDS.summary} caracteres.`,
        ),
      ],
    }),
    defineField({
      name: 'intro',
      title: 'Introducción',
      description: 'El párrafo con el que se abre el panel, antes de la lista de servicios.',
      type: 'text',
      rows: 5,
      fieldset: 'distrito',
      validation: (rule) => [
        rule.required().error('Escribe la introducción.'),
        rule.max(BOUNDS.intro).error(`Demasiado largo: como máximo ${BOUNDS.intro} caracteres.`),
      ],
    }),
    defineField({
      name: 'services',
      title: 'Servicios',
      description: 'Elige los servicios de la lista. Puedes arrastrarlos para cambiar el orden.',
      type: 'array',
      fieldset: 'servicios',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'service' }] })],
      validation: (rule) => [
        rule.required().min(1).error('Añade al menos un servicio.'),
        rule.max(BOUNDS.services).error(`Como máximo ${BOUNDS.services} servicios.`),
        rule.unique().error('Ese servicio ya está en la lista.'),
      ],
    }),
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      options: slugOptions('label'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule),
    }),
  ],
  preview: { select: { title: 'label', subtitle: 'summary' } },
})
