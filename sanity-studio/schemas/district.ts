import { PinIcon } from '@sanity/icons/Pin'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { serviceMembership } from './lib/serviceMembership'
import { plainText } from './lib/plainText'
import { darkColorAdvice, markupAdvice, singleParagraphAdvice } from './lib/advice'
import { charCount } from '../components/CharCountInput'
import { colorHexInput } from '../components/ColorHexInput'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'
import { slugOptions, slugValidation } from './lib/slug'
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
const BOUNDS = EDITORIAL_BOUNDS.district

const PARTICLE_COLOR_INPUT = colorHexInput({
  shown: 'Así se verá junto al blanco de las partículas.',
  empty: 'Sin color: la web usará su azul.',
  fallback: DEFAULT_PARTICLE_COLOR,
})

/**
 * A district — the copy behind the services campus in the city.
 *
 * Presented to the editor as "Sección de servicios": "distrito" is the scene's
 * word, and there is exactly one. The type NAME stays `district`, because that
 * is what the GROQ projection and the stored documents say.
 *
 * ── What each field is for since the campus (DECISIONS §45) ──
 * `label` is the big title when the section opens and the word on the cursor
 * compass; the service invitation on the LED ring is hardcoded and does NOT follow it.
 * `summary` is the line under that title, on every device. `particleColor` is
 * mixed with white in the campus particles on entering, and stands in for any
 * service without its own. `services` is the set of stops around the lake, in
 * order. `intro` has no reader — see below.
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
 *
 * ── The services list is the editor's, as of 2026-09-21 ──
 * Adding, removing and reordering are all free now. They were not: every service
 * needed a symbol row in `cityDistrictBindings.ts` that only a developer could
 * write, so the list was `readOnly` with add and remove disabled and the
 * description told the editor to ask. The shapes moved onto the service document
 * (`symbol`, `figure`), which left nothing technical to ask about. What still
 * holds is the cap — `EDITORIAL_BOUNDS.district.services` — and the requirement
 * that a listed service actually be published, which `serviceMembership` checks.
 */
export const district = defineType({
  name: 'district',
  title: 'Sección de servicios',
  icon: PinIcon,
  type: 'document',
  fieldsets: [
    {
      name: 'distrito',
      title: 'Al entrar en la sección',
      description:
        'Lo primero que se lee cuando alguien pulsa el lago de la ciudad y se abre la sección ' +
        'de servicios.',
    },
    {
      name: 'servicios',
      title: 'Servicios',
      description:
        'Alrededor del lago hay una parada por servicio, y el visitante las recorre en este ' +
        'orden. El texto de cada servicio se edita en «Todos los servicios».',
    },
    TECH_FIELDSET,
  ],
  fields: [
    defineField({
      name: 'label',
      title: 'Título de la sección',
      description:
        'El título grande al entrar en la sección, y el nombre de la sección en la brújula de ' +
        'arriba de la pantalla. El letrero luminoso del edificio no cambia con este campo.',
      type: 'string',
      fieldset: 'distrito',
      placeholder: 'Servicios',
      components: { input: charCount(BOUNDS.label) },
      validation: (rule) => [
        rule.required().error('Escribe el título de la sección.'),
        rule.max(BOUNDS.label).error(`Demasiado largo: como máximo ${BOUNDS.label} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'summary',
      title: 'Subtítulo',
      description: 'Una sola frase, justo debajo del título.',
      type: 'text',
      rows: 2,
      fieldset: 'distrito',
      components: { input: charCount(BOUNDS.summary) },
      validation: (rule) => [
        rule.required().error('Escribe una frase de subtítulo.'),
        rule.max(BOUNDS.summary).error(
          `Demasiado largo: como máximo ${BOUNDS.summary} caracteres.`,
        ),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(singleParagraphAdvice).warning(),
      ],
    }),
    defineField({
      name: 'particleColor',
      title: 'Color de las partículas',
      description:
        'Opcional. Al entrar en la sección, las partículas suben del lago y forman un disco en ' +
        'blanco y en este color. Es también el color de cualquier servicio que no tenga el suyo. ' +
        'Vacío, se usa el azul de la web.',
      type: 'string',
      fieldset: 'distrito',
      placeholder: DEFAULT_PARTICLE_COLOR,
      components: { input: PARTICLE_COLOR_INPUT },
      // Optional: empty means the site's blue. A value that IS given must still
      // be a real #rrggbb, so a typo cannot ship.
      validation: (rule) => [
        rule
          .regex(/^#[0-9a-fA-F]{6}$/)
          .error('Escribe el color en formato #rrggbb, por ejemplo #1c67ff — o déjalo vacío'),
        rule.custom(darkColorAdvice).warning(),
      ],
    }),
    // HIDDEN, and not required here. Nothing has read `intro` since the campus
    // replaced the panel (§45), so asking for it had the editor writing a
    // paragraph nobody sees. The Studio's `required()` goes with the field:
    // Sanity validates hidden fields too, and a required error on a field the
    // editor cannot see is an unpublishable document with no way to fix it.
    // `districtProblems` in the build still requires a value, and the one
    // district already has it — removing it end-to-end is a separate task.
    defineField({
      name: 'intro',
      title: 'Introducción',
      type: 'text',
      rows: 5,
      fieldset: 'distrito',
      hidden: true,
      validation: (rule) => [
        rule.max(BOUNDS.intro).error(`Demasiado largo: como máximo ${BOUNDS.intro} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'services',
      title: 'Servicios y su orden',
      description:
        'Añade, quita y arrastra para cambiar el orden en que se visitan. Cada servicio es una ' +
        'parada alrededor del lago. Su texto se edita en «Todos los servicios», y ahí mismo se ' +
        'eligen su símbolo y su figura.',
      type: 'array',
      fieldset: 'servicios',
      // Adding and removing were disabled until 2026-09-21, because each service
      // needed a symbol row in `cityDistrictBindings.ts` that only a developer
      // could write. The shapes are fields on the service document now, so there
      // is nothing technical left to do and no reason to hold the editor back.
      // The campus sizes itself: `stops` is `content.services.length + 1`.
      options: { sortable: true },
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'service' }] })],
      validation: (rule) => [
        rule.required().min(1).error('Añade al menos un servicio.'),
        rule.max(BOUNDS.services).error(`Como máximo ${BOUNDS.services} servicios.`),
        rule.unique().error('Ese servicio ya está en la lista.'),
        rule.custom(serviceMembership),
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
      validation: (rule) => slugValidation(rule, 'Este identificador lo fija el equipo técnico y enlaza la sección con la ciudad. Si aparece vacío, no lo rellenes: avísales.'),
    }),
  ],
  preview: { select: { title: 'label', subtitle: 'summary' } },
})
