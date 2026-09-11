import { WrenchIcon } from '@sanity/icons/Wrench'
import { defineField, defineType } from 'sanity'
import { charCount } from '../components/CharCountInput'
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
 * `shortTitle` is a blog filter pill's label, and its bound is a Studio-side
 * nudge (`.warning`), not a rule the build applies. Named so the rule and the
 * counter cannot disagree.
 */
const SHORT_TITLE_MAX = 24

/**
 * One thing the agency does.
 *
 * A document rather than a row inside a district, so it is edited once and
 * reaches two places: a stop around the campus lake (when the district lists
 * it) and a topic on the blog (every `blogPost.category` references one). A
 * district reference that will not resolve — deleted, or never published —
 * fails the build naming the district and the position, rather than leaving a
 * stop missing where it would read as an editorial choice.
 *
 * The identifier keys the service to its particle symbol in
 * `cityDistrictBindings.ts` and is the blog's `?tema=` value, which is why it is
 * locked once set. That reasoning lives here, not in the description an editor
 * reads.
 *
 * `body` is split by `district/serviceCopy.ts`: the first paragraph (or, with
 * one paragraph, the opening sentence) is the always-visible line under the
 * title, and "+" opens the whole text. The description says so without the
 * character count, which lives in that file and would go stale here.
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
      description:
        'Corto, como un título. Se lee en grande al llegar a este servicio en la ciudad, y ' +
        'encima del título de las entradas del blog que tratan de él.',
      type: 'string',
      placeholder: 'Analítica web',
      components: { input: charCount(BOUNDS.title) },
      validation: (rule) => [
        rule.required().error('Escribe el nombre del servicio.'),
        rule.max(BOUNDS.title).error(`Demasiado largo: como máximo ${BOUNDS.title} caracteres.`),
      ],
    }),
    defineField({
      name: 'shortTitle',
      title: 'Nombre corto',
      description:
        'Opcional. Una o dos palabras para el blog, donde no cabe el nombre entero: los ' +
        'botones de filtrar por tema, las tarjetas de las entradas y el «Más de …» al final ' +
        'de cada entrada. Ejemplo: «Contenidos» para «Estrategia de contenidos». Vacío, se usa ' +
        'el nombre completo.',
      type: 'string',
      components: { input: charCount(SHORT_TITLE_MAX) },
      validation: (rule) =>
        rule.max(SHORT_TITLE_MAX).warning('Cuanto más corto, mejor encaja en un filtro.'),
    }),
    defineField({
      name: 'body',
      title: 'Descripción',
      description:
        'Uno o dos párrafos. Debajo del nombre se ve siempre el principio: el primer párrafo si ' +
        'escribes dos, o la primera frase si escribes uno. El texto completo se abre al pulsar ' +
        '«+». Lo más claro: un primer párrafo de una frase que resuma el servicio, y un segundo ' +
        'con el detalle.',
      type: 'text',
      rows: 6,
      components: { input: charCount(BOUNDS.body) },
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
