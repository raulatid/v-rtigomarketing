import { WrenchIcon } from '@sanity/icons/Wrench'
import { defineField, defineType } from 'sanity'
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
const BOUNDS = EDITORIAL_BOUNDS.service

/**
 * One thing the agency does.
 *
 * A document rather than a row inside a district, so it is edited once and can
 * appear in more than one district. A district REFERENCES these; a reference
 * that will not resolve — deleted, or never published — fails the build naming
 * the district and the position, rather than leaving a section missing from a
 * panel where it would read as an editorial choice.
 *
 * The identifier becomes the accordion's `aria-controls` value, which is why
 * ID_PATTERN is narrower than a free slug. That reasoning lives here, not in the
 * description an editor reads.
 */
export const service = defineType({
  name: 'service',
  title: 'Servicio',
  icon: WrenchIcon,
  type: 'document',
  fieldsets: [TECH_FIELDSET],
  fields: [
    defineField({
      name: 'title',
      title: 'Nombre del servicio',
      description: 'Corto, como un título. Ejemplo: SEO, Analítica web, Identidad de marca.',
      type: 'string',
      validation: (rule) => [
        rule.required().error('Escribe el nombre del servicio.'),
        rule.max(BOUNDS.title).error(`Demasiado largo: como máximo ${BOUNDS.title} caracteres.`),
      ],
    }),
    defineField({
      name: 'shortTitle',
      title: 'Título corto',
      description:
        'Opcional. Una o dos palabras para donde no cabe el título entero: los filtros del ' +
        'blog y las tarjetas de las entradas. Ejemplo: "Contenidos" para "Estrategia de ' +
        'contenidos". Si lo dejas vacío se usa el título completo.',
      type: 'string',
      validation: (rule) => rule.max(24).warning('Cuanto más corto, mejor encaja en un filtro.'),
    }),
    defineField({
      name: 'body',
      title: 'Descripción',
      description: 'Uno o dos párrafos. Se muestra al abrir la sección.',
      type: 'text',
      rows: 6,
      validation: (rule) => [
        rule.required().error('Escribe una descripción.'),
        rule.max(BOUNDS.body).error(
          `Demasiado largo: como máximo ${BOUNDS.body} caracteres (uno o dos párrafos).`,
        ),
      ],
    }),
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      options: slugOptions('title'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule, 'Pulsa "Generar" para crear el identificador.'),
    }),
  ],
  preview: {
    select: { title: 'title', body: 'body' },
    prepare: ({ title, body }) => ({
      title,
      subtitle: typeof body === 'string' ? body.slice(0, 60) + (body.length > 60 ? '…' : '') : '',
    }),
  },
})
