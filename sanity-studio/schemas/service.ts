import { WrenchIcon } from '@sanity/icons/Wrench'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { EditorialDocument } from '../components/EditorialDocument'
import { charCount } from '../components/CharCountInput'
import { colorHexInput } from '../components/ColorHexInput'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'
import { slugOptions, slugValidation } from './lib/slug'
import { plainText } from './lib/plainText'
import { darkColorAdvice, markupAdvice, serviceOpeningAdvice } from './lib/advice'
import { DEFAULT_PARTICLE_COLOR, EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'

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
 * An empty service colour resolves to its section's, which the Studio cannot
 * know from here; the picker starts at the section's default instead.
 */
const PARTICLE_COLOR_INPUT = colorHexInput({
  shown: 'Así se verá junto al blanco de las partículas.',
  empty: 'Sin color: usará el de la entrada de la sección.',
  fallback: DEFAULT_PARTICLE_COLOR,
})

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
 * one paragraph, the opening sentence) is the larger line under the title, and
 * the rest follows it. The description says so without the character count,
 * which lives in that file and would go stale here.
 */
export const service = defineType({
  name: 'service',
  title: 'Servicio',
  icon: WrenchIcon,
  type: 'document',
  components: { input: EditorialDocument },
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
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
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
      components: { input: charCount(SHORT_TITLE_MAX, 'warning') },
      validation: (rule) => [
        rule.max(SHORT_TITLE_MAX).warning('Cuanto más corto, mejor encaja en un filtro.'),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'body',
      title: 'Descripción del servicio',
      description:
        'Dos líneas breves debajo del título del servicio, separadas por un salto de línea. ' +
        'Procura no superar los 40 caracteres por línea. Los párrafos adicionales no se muestran en el campus.',
      type: 'text',
      rows: 2,
      components: { input: charCount(BOUNDS.body) },
      validation: (rule) => [
        rule.required().error('Escribe una descripción.'),
        rule.max(BOUNDS.body).error(
          `Demasiado largo: como máximo ${BOUNDS.body} caracteres (uno o dos párrafos).`,
        ),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(serviceOpeningAdvice).warning(),
      ],
    }),
    // The figure itself is drawn by code (`cityDistrictBindings.ts`), because
    // it is geometry; only its wording is editorial. Both fields are optional
    // so the documents published before they existed keep building.
    defineField({
      name: 'figureCaption',
      title: 'Leyenda anterior de la figura',
      hidden: true,
      description:
        'Opcional. Al llegar a este servicio en la ciudad, su símbolo de partículas se convierte ' +
        'en una figura. Esta frase aparece bajo el texto cuando la figura termina de formarse, y ' +
        'explica qué dibuja. Vacío, no se muestra.',
      type: 'string',
      components: { input: charCount(BOUNDS.figureCaption) },
      validation: (rule) => [
        rule
          .max(BOUNDS.figureCaption)
          .error(`Demasiado largo: como máximo ${BOUNDS.figureCaption} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'measures',
      title: 'Puntos destacados del servicio',
      description:
        'Tres puntos breves, uno por fila. Aparecen cuando el símbolo de partículas empieza ' +
        'a transformarse en la figura del servicio. Escribe puntos concisos y concretos.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'string',
          components: { input: charCount(BOUNDS.measure) },
          validation: (rule) => [
            rule.required().error('Escribe el punto destacado.'),
            rule.max(BOUNDS.measure).error(`Demasiado largo: como máximo ${BOUNDS.measure} caracteres.`),
            rule.custom(plainText),
            rule.custom(markupAdvice).warning(),
          ],
        }),
      ],
      validation: (rule) =>
        rule.required().length(BOUNDS.measures).error(`Escribe exactamente ${BOUNDS.measures} puntos destacados.`),
    }),
    defineField({
      name: 'particleColor',
      title: 'Color de las partículas',
      description:
        'Opcional. Al llegar a este servicio en la ciudad, las partículas sobre el lago forman su ' +
        'símbolo en blanco y en este color. Vacío, usa el color de la entrada de la sección.',
      type: 'string',
      placeholder: '#ffb020',
      components: { input: PARTICLE_COLOR_INPUT },
      // Optional: empty means "the section's colour". A value that IS given
      // must still be a real #rrggbb, so a typo cannot ship.
      validation: (rule) => [
        rule
          .regex(/^#[0-9a-fA-F]{6}$/)
          .error('Escribe el color en formato #rrggbb, por ejemplo #ffb020 — o déjalo vacío'),
        rule.custom(darkColorAdvice).warning(),
      ],
    }),
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      hidden: ({value, currentUser}) => !!(value as { current?: string } | undefined)?.current && !currentUser?.roles.some((role) => role.name === 'administrator'),
      options: slugOptions('title'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule, 'Escribe el nombre y espera a que se genere el identificador. Si no aparece, pulsa «Generar» en «Identificador interno».'),
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
