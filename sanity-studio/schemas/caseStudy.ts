import { EarthGlobeIcon } from '@sanity/icons/EarthGlobe'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { EditorialDocument } from '../components/EditorialDocument'
import { charCount } from '../components/CharCountInput'
import { ColorHexInput } from '../components/ColorHexInput'
import { brandMarkAdvice, brandMarkErrors } from './lib/brandMark'
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
const BOUNDS = EDITORIAL_BOUNDS.caseStudy

/**
 * A case study — one of the brands riding an orbit around the Earth.
 *
 * ── What is NOT here ──
 * Which orbit a case occupies. That is scene composition and lives in
 * `src/experiences/earth/orbit/orbitAssignments.ts`. Publishing a case study
 * does NOT create an orbit: the Earth keeps a finite, art-directed set of slots.
 * The editor is told this in the first fieldset, in plain words.
 *
 * ── The bounds are layout facts ──
 * `details` is a four-line bullet list, `metrics` is a fixed two-up grid, and
 * chart values are normalised into 340 SVG units. Over-length is REJECTED by the
 * build rather than trimmed. The descriptions below state the limit and never
 * the reason — the reason is for whoever edits this file.
 *
 * ── Fields are in the order the panel shows them ──
 * `CasePanel.tsx` reads: name, the sector · location · year line, the two
 * metrics, the summary, the bullets, the chart. The form follows it, so an
 * editor filling it top to bottom is writing the panel top to bottom.
 *
 * ── The chart is one list of points ──
 * The website's model is `values: number[]` + `labels?: string[]`, two parallel
 * arrays. An editor keeping two lists aligned by hand is the mistake this
 * schema exists to make impossible: they enter ONE list of `{label, value}`, and
 * the GROQ projection in `caseStudies.collection.ts` splits it back —
 * `"values": points[].value`, `"labels": select(type in [...] => points[].label)`.
 * The app, the mappers and the fixtures never learn the Studio changed.
 */

const NEEDS_LABELS = ['bars', 'donut'] as const

type ChartType = 'line' | 'bars' | 'area' | 'donut'
type Point = { label?: string; value?: number }
type Chart = { type?: ChartType; points?: Point[] }

function needsLabels(type: unknown): boolean {
  return (NEEDS_LABELS as readonly string[]).includes(String(type))
}

const chart = defineField({
  name: 'chart',
  title: 'Gráfico',
  type: 'object',
  fieldset: 'grafico',
  options: { collapsible: false },
  validation: (rule) => [
    rule.required().error('El caso necesita un gráfico.'),
    // The check the old two-list design promised in prose and never enforced.
    rule.custom((value) => {
      const current = value as Chart | undefined
      if (!current || !needsLabels(current.type)) return true
      const points = current.points ?? []
      const missing = points.filter((p) => !p.label || p.label.trim().length === 0).length
      if (missing === 0) return true
      return (
        'Un gráfico de barras o donut necesita un nombre en cada punto: ' +
        (missing === 1 ? 'falta uno.' : 'faltan ' + missing + '.')
      )
    }),
  ],
  fields: [
    defineField({
      name: 'type',
      title: 'Tipo de gráfico',
      description:
        'Línea o área: cómo cambia algo con el tiempo. Barras: comparar cantidades entre sí. ' +
        'Donut: cómo se reparte un total.',
      type: 'string',
      initialValue: 'line',
      options: {
        layout: 'radio',
        direction: 'horizontal',
        list: [
          { title: 'Línea', value: 'line' },
          { title: 'Área', value: 'area' },
          { title: 'Barras', value: 'bars' },
          { title: 'Donut', value: 'donut' },
        ],
      },
      validation: (rule) => rule.required().error('Elige un tipo de gráfico.'),
    }),
    defineField({
      name: 'title',
      title: 'Qué muestra',
      description: 'Una frase corta que se lee encima del gráfico.',
      type: 'string',
      placeholder: 'Tráfico orgánico mensual',
      components: { input: charCount(BOUNDS.chartTitle) },
      validation: (rule) => [
        rule.required().error('Escribe qué muestra el gráfico.'),
        rule.max(BOUNDS.chartTitle).error(`Demasiado largo: como máximo ${BOUNDS.chartTitle} caracteres.`),
      ],
    }),
    defineField({
      name: 'points',
      title: 'Datos',
      description:
        'Los puntos del gráfico, en orden: pulsa «Añadir elemento» por cada uno. En barras y ' +
        'donut cada punto lleva además un nombre.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'point',
          title: 'Punto',
          fields: [
            defineField({
              name: 'value',
              title: 'Valor',
              type: 'number',
              validation: (rule) => rule.required().error('Escribe un número.'),
            }),
            defineField({
              name: 'label',
              title: 'Nombre',
              description: 'Lo que se lee bajo la barra, o en la leyenda del donut. Ejemplo: T1, DE, Fichas',
              type: 'string',
              components: { input: charCount(BOUNDS.chartLabel) },
              // Only bar and donut charts draw labels. Hiding the field for the
              // other two keeps a line chart's data entry to one number per row.
              hidden: ({ document }) =>
                !needsLabels((document as { chart?: Chart } | undefined)?.chart?.type),
              validation: (rule) =>
                rule.max(BOUNDS.chartLabel).error(
                  `Demasiado largo: como máximo ${BOUNDS.chartLabel} caracteres.`,
                ),
            }),
          ],
          preview: {
            select: { value: 'value', label: 'label' },
            prepare: ({ value, label }) => ({
              title: typeof value === 'number' ? String(value) : '—',
              subtitle: typeof label === 'string' ? label : '',
            }),
          },
        }),
      ],
      validation: (rule) => [
        rule.required().min(1).error('Añade al menos un punto.'),
        rule.max(BOUNDS.chartValues).error(
          `Como máximo ${BOUNDS.chartValues} puntos: con más no se distinguen.`,
        ),
      ],
    }),
  ],
})

/**
 * Cross-check for the isotype/logo pair: both uploaded, or neither.
 *
 * The satellite's brand panel rests showing the isotype and unfolds into the
 * full logo when a visitor opens the case. A case with only one of them would
 * morph from a real trademark into a generated placeholder halfway through that
 * animation — plausible-looking and wrong on exactly one satellite.
 *
 * The content build enforces this too (content/collections/caseStudies.collection.ts),
 * and that is the enforcement that actually protects the site. This exists so the
 * editor finds out while they are still in the Studio, next to the empty field,
 * rather than from a failed deploy hours later.
 *
 * Reads the sibling off `context.document` rather than the parent, because both
 * fields sit at the document root.
 */
function brandMarksTogether(sibling: 'isotype' | 'logo', message: string) {
  return (value: unknown, context: { document?: Record<string, unknown> }) => {
    const doc = context.document
    if (!doc) return true
    const missing = value === undefined || value === null
    const siblingPresent = doc[sibling] !== undefined && doc[sibling] !== null
    // Only the EMPTY half complains, and only when its partner is filled. Firing
    // on both would light up the field the editor already did correctly and
    // leave them guessing which one to act on.
    return missing && siblingPresent ? message : true
  }
}

export const caseStudy = defineType({
  name: 'caseStudy',
  title: 'Caso de éxito',
  icon: EarthGlobeIcon,
  type: 'document',
  components: { input: EditorialDocument },
  fieldsets: [
    {
      name: 'marca',
      title: 'Marca',
      description:
        'Cada caso es una marca que gira alrededor del planeta, sobre un satélite. Hay seis ' +
        'órbitas: un caso nuevo se guarda aquí, pero solo aparece en la web cuando el equipo ' +
        'técnico le asigna una.',
    },
    {
      name: 'ficha',
      title: 'Sector, ciudad y año',
      description: 'Se leen en una sola línea bajo el nombre: Sector · Ciudad · Año.',
      options: { columns: 3 },
    },
    {
      name: 'panel',
      title: 'Texto del panel',
      description:
        'Al pinchar el satélite se abre un panel con el caso: primero las dos métricas, luego el ' +
        'resumen, los puntos clave y el gráfico.',
    },
    {
      name: 'grafico',
      title: 'Gráfico',
      description:
        'El gráfico dibuja la forma de los datos; los números en sí no se ven, salvo los ' +
        'porcentajes del donut.',
    },
    TECH_FIELDSET,
  ],
  fields: [
    defineField({
      name: 'name',
      title: 'Nombre de la marca',
      description:
        'El nombre de la empresa, tal y como se lee en el título del panel. Si no subes ' +
        'imágenes de marca, su inicial hace de símbolo.',
      type: 'string',
      fieldset: 'marca',
      placeholder: 'Mango',
      components: { input: charCount(BOUNDS.name) },
      validation: (rule) => [
        rule.required().error('Escribe el nombre de la marca.'),
        rule.max(BOUNDS.name).error(`Demasiado largo: como máximo ${BOUNDS.name} caracteres.`),
      ],
    }),
    // HIDDEN. Nothing on the site renders `label` (`src/content/types.ts` says
    // so, and the build fills it from `name` when empty), so offering it asked
    // the editor for words nobody reads. The stored values stay; removing the
    // field from the projection and the types is a separate task.
    defineField({
      name: 'label',
      title: 'Nombre corto',
      type: 'string',
      fieldset: 'marca',
      hidden: true,
      validation: (rule) =>
        rule.max(BOUNDS.name).error(`Demasiado largo: como máximo ${BOUNDS.name} caracteres.`),
    }),
    defineField({
      name: 'isotype',
      title: 'Isotipo (símbolo)',
      description:
        'Opcional, pero va junto con el logotipo: los dos o ninguno. Solo el símbolo de la ' +
        'marca, sin el nombre. PNG o WebP cuadrado con fondo transparente, 512×512 píxeles ' +
        '(mínimo 432×432). Es lo que flota sobre el satélite todo el rato, así que es la más ' +
        'importante de las dos. Sin imágenes, la web dibuja un anillo fino con la inicial de ' +
        'la marca.',
      type: 'image',
      fieldset: 'marca',
      // Narrows the file picker and the drop zone. NOT a guarantee: an asset
      // chosen from the media library never passes through it, which is why the
      // format is checked again below.
      options: { accept: 'image/png,image/webp' },
      validation: (rule) => [
        rule.custom(
          brandMarksTogether('logo', 'Has subido el logotipo completo: sube también el isotipo.'),
        ),
        rule.custom(brandMarkErrors('isotype')),
        // `.warning()` is the whole difference between the two tiers: a warning
        // is shown at the field and leaves Publicar enabled.
        rule.custom(brandMarkAdvice('isotype')).warning(),
      ],
    }),
    defineField({
      name: 'logo',
      title: 'Logotipo completo',
      description:
        'Opcional, pero va junto con el isotipo: los dos o ninguno. El símbolo junto al ' +
        'nombre de la marca. PNG o WebP apaisado con fondo transparente, 1600×800 píxeles ' +
        '(mínimo 900 de ancho). Solo aparece cuando alguien pincha el satélite y se abre el ' +
        'caso. Sin imágenes, la web dibuja el anillo con la inicial y el nombre escrito al lado.',
      type: 'image',
      fieldset: 'marca',
      options: { accept: 'image/png,image/webp' },
      validation: (rule) => [
        rule.custom(
          brandMarksTogether('isotype', 'Has subido el isotipo: sube también el logotipo completo.'),
        ),
        rule.custom(brandMarkErrors('logo')),
        rule.custom(brandMarkAdvice('logo')).warning(),
      ],
    }),
    defineField({
      name: 'brandColor',
      title: 'Color de marca',
      description:
        'Opcional. El color principal de la marca: pega su código (#rrggbb) o elígelo con el ' +
        'selector. Tiñe las tarjetas de las métricas, las viñetas y el gráfico del caso, y el ' +
        'anillo si no hay imágenes de marca. Si la marca no tiene un color propio, déjalo ' +
        'vacío y la web usará blanco: no inventes uno por rellenarlo. Si solo tienes el ' +
        'Pantone, pide su equivalente en código.',
      type: 'string',
      fieldset: 'marca',
      placeholder: '#e0b33c',
      components: { input: ColorHexInput },
      // Optional on purpose — see the description. Empty means "white"; a value
      // that IS given must still be a real #rrggbb, so a typo cannot ship.
      validation: (rule) =>
        rule
          .regex(/^#[0-9a-fA-F]{6}$/)
          .error(
            'Escribe el color en formato #rrggbb, por ejemplo #e0b33c — o déjalo vacío si la marca no tiene color',
          ),
    }),
    defineField({
      name: 'sector',
      title: 'Sector',
      type: 'string',
      fieldset: 'ficha',
      placeholder: 'Moda y retail',
      components: { input: charCount(BOUNDS.name) },
      validation: (rule) => [
        rule.required().error('Escribe el sector.'),
        rule.max(BOUNDS.name).error('Demasiado largo.'),
      ],
    }),
    defineField({
      name: 'location',
      title: 'Ciudad',
      type: 'string',
      fieldset: 'ficha',
      placeholder: 'Barcelona, España',
      components: { input: charCount(BOUNDS.name) },
      validation: (rule) => [
        rule.required().error('Escribe la ubicación.'),
        rule.max(BOUNDS.name).error('Demasiado largo.'),
      ],
    }),
    defineField({
      name: 'year',
      title: 'Año',
      description: 'También vale un periodo: 2024-2025',
      type: 'string',
      fieldset: 'ficha',
      placeholder: '2025',
      validation: (rule) => [
        rule.required().error('Escribe el año.'),
        rule.max(16).error('Demasiado largo.'),
      ],
    }),
    defineField({
      name: 'metrics',
      title: 'Métricas',
      description:
        'Exactamente dos cifras destacadas, cada una en su tarjeta, con su nombre encima. ' +
        'Ejemplo: Tráfico orgánico → +148 %',
      type: 'array',
      fieldset: 'panel',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'metric',
          title: 'Métrica',
          fields: [
            defineField({
              name: 'label',
              title: 'Nombre',
              type: 'string',
              placeholder: 'Tráfico orgánico',
              components: { input: charCount(BOUNDS.metricLabel) },
              validation: (rule) => [
                rule.required().error('Escribe el nombre de la métrica.'),
                rule.max(BOUNDS.metricLabel).error(
                  `Demasiado largo: como máximo ${BOUNDS.metricLabel} caracteres.`,
                ),
              ],
            }),
            defineField({
              name: 'value',
              title: 'Cifra',
              description: 'Tal cual se lee, con su signo y su unidad.',
              type: 'string',
              placeholder: '+148 %',
              components: { input: charCount(BOUNDS.metricValue) },
              validation: (rule) => [
                rule.required().error('Escribe la cifra.'),
                rule.max(BOUNDS.metricValue).error(
                  `Demasiado largo: como máximo ${BOUNDS.metricValue} caracteres.`,
                ),
              ],
            }),
          ],
          preview: { select: { title: 'value', subtitle: 'label' } },
        }),
      ],
      validation: (rule) =>
        rule
          .required()
          .length(BOUNDS.metrics)
          .error(
            `Hacen falta exactamente ${BOUNDS.metrics} métricas: el panel tiene ${BOUNDS.metrics} huecos.`,
          ),
    }),
    defineField({
      name: 'summary',
      title: 'Resumen',
      description: 'Dos o tres frases sobre lo que se hizo. Se lee justo debajo de las dos métricas.',
      type: 'text',
      rows: 4,
      fieldset: 'panel',
      components: { input: charCount(BOUNDS.summary) },
      validation: (rule) => [
        rule.required().error('Escribe un resumen.'),
        rule.max(BOUNDS.summary).error(`Demasiado largo: como máximo ${BOUNDS.summary} caracteres.`),
      ],
    }),
    defineField({
      name: 'details',
      title: 'Puntos clave',
      description:
        'Opcional. Hasta cuatro ideas cortas, una por línea. Se muestran como una lista con ' +
        'viñetas, bajo el resumen.',
      type: 'array',
      fieldset: 'panel',
      of: [
        defineArrayMember({
          type: 'string',
          components: { input: charCount(BOUNDS.detailLine) },
          validation: (rule) =>
            rule.max(BOUNDS.detailLine).error(
              `Demasiado largo: cada línea, como máximo ${BOUNDS.detailLine} caracteres.`,
            ),
        }),
      ],
      validation: (rule) =>
        rule.max(BOUNDS.details).error(`Como máximo ${BOUNDS.details} puntos clave.`),
    }),
    chart,
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      hidden: ({value, currentUser}) => !!(value as { current?: string } | undefined)?.current && !currentUser?.roles.some((role) => role.name === 'administrator'),
      options: slugOptions('name'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule, 'Escribe el nombre y espera a que se genere el identificador. Si no aparece, pulsa «Generar» en «Identificador interno».'),
    }),
  ],
  preview: {
    // The isotype, not the logo: square artwork reads better in Sanity's
    // document list, which crops its thumbnail to a square anyway.
    select: { title: 'name', sector: 'sector', location: 'location', media: 'isotype' },
    prepare: ({ title, sector, location, media }) => ({
      title,
      media,
      subtitle: [sector, location].filter(Boolean).join(' · '),
    }),
  },
})
