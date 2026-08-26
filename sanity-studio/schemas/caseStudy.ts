import { EarthGlobeIcon } from '@sanity/icons/EarthGlobe'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { brandMarkAdvice, brandMarkErrors } from './lib/brandMark'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'

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
      description: 'Una frase corta sobre el gráfico. Ejemplo: Tráfico orgánico mensual',
      type: 'string',
      validation: (rule) => [
        rule.required().error('Escribe qué muestra el gráfico.'),
        rule.max(80).error('Demasiado largo: como máximo 80 caracteres.'),
      ],
    }),
    defineField({
      name: 'points',
      title: 'Datos',
      description:
        'Los puntos del gráfico, en orden. En barras y donut cada punto lleva además un nombre.',
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
              description: 'Lo que se lee bajo la barra o junto al trozo del donut. Ejemplo: T1, DE, Fichas',
              type: 'string',
              // Only bar and donut charts draw labels. Hiding the field for the
              // other two keeps a line chart's data entry to one number per row.
              hidden: ({ document }) =>
                !needsLabels((document as { chart?: Chart } | undefined)?.chart?.type),
              validation: (rule) => rule.max(24).error('Demasiado largo: como máximo 24 caracteres.'),
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
        rule.max(16).error('Como máximo 16 puntos: con más no se distinguen.'),
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
  fieldsets: [
    {
      name: 'marca',
      title: 'Marca',
      description:
        'Cada caso es una marca que orbita el planeta. Un caso nuevo se guarda aquí, pero solo ' +
        'aparece en la web cuando el equipo técnico le asigna un lugar en la órbita.',
    },
    {
      name: 'ficha',
      title: 'Ficha',
      description: 'Sector, ciudad y año, tal y como se muestran bajo el nombre.',
      options: { columns: 3 },
    },
    {
      name: 'panel',
      title: 'Texto del panel',
      description: 'Lo que se lee al abrir el caso.',
    },
    {
      name: 'grafico',
      title: 'Gráfico',
    },
    TECH_FIELDSET,
  ],
  fields: [
    defineField({
      name: 'name',
      title: 'Marca',
      description: 'El nombre de la empresa. Ejemplo: Mango',
      type: 'string',
      fieldset: 'marca',
      validation: (rule) => [
        rule.required().error('Escribe el nombre de la marca.'),
        rule.max(60).error('Demasiado largo: como máximo 60 caracteres.'),
      ],
    }),
    defineField({
      name: 'label',
      title: 'Nombre corto',
      description: 'Opcional. Si la marca tiene una forma corta o en mayúsculas, ponla aquí. Ejemplo: MANGO',
      type: 'string',
      fieldset: 'marca',
      validation: (rule) => rule.max(60).error('Demasiado largo: como máximo 60 caracteres.'),
    }),
    defineField({
      name: 'isotype',
      title: 'Isotipo (símbolo)',
      description:
        'Solo el símbolo de la marca, sin el nombre. PNG o WebP cuadrado con fondo ' +
        'transparente, 512×512 píxeles (mínimo 432×432). Es lo que se ve sobre el ' +
        'satélite todo el rato, así que es la imagen más importante de las dos. ' +
        'Si no subes ninguna, la web muestra un círculo con el color de marca.',
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
        'El símbolo junto al nombre de la marca. PNG o WebP apaisado con fondo ' +
        'transparente, 1600×800 píxeles (mínimo 900 de ancho). Solo aparece cuando ' +
        'alguien pincha el satélite y se abre la ficha del caso. ' +
        'Si no subes ninguna, la web muestra una placa con el color de marca.',
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
        'El color principal de la marca, en formato #rrggbb. Ejemplo: #e0b33c. ' +
        'Si tienes el Pantone, pide el equivalente en hexadecimal.',
      type: 'string',
      fieldset: 'marca',
      validation: (rule) =>
        rule
          .required()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .error('Escribe el color en formato #rrggbb, por ejemplo #e0b33c'),
    }),
    defineField({
      name: 'sector',
      title: 'Sector',
      description: 'Ejemplo: Moda y retail',
      type: 'string',
      fieldset: 'ficha',
      validation: (rule) => [
        rule.required().error('Escribe el sector.'),
        rule.max(60).error('Demasiado largo.'),
      ],
    }),
    defineField({
      name: 'location',
      title: 'Ubicación',
      description: 'Ejemplo: Barcelona, España',
      type: 'string',
      fieldset: 'ficha',
      validation: (rule) => [
        rule.required().error('Escribe la ubicación.'),
        rule.max(60).error('Demasiado largo.'),
      ],
    }),
    defineField({
      name: 'year',
      title: 'Año',
      description: 'Ejemplo: 2025',
      type: 'string',
      fieldset: 'ficha',
      validation: (rule) => [
        rule.required().error('Escribe el año.'),
        rule.max(16).error('Demasiado largo.'),
      ],
    }),
    defineField({
      name: 'summary',
      title: 'Resumen',
      description: 'Dos o tres frases sobre lo que se hizo. Es lo primero que se lee al abrir el caso.',
      type: 'text',
      rows: 4,
      fieldset: 'panel',
      validation: (rule) => [
        rule.required().error('Escribe un resumen.'),
        rule.max(400).error('Demasiado largo: como máximo 400 caracteres.'),
      ],
    }),
    defineField({
      name: 'details',
      title: 'Puntos clave',
      description: 'Hasta cuatro líneas cortas, una idea por línea. Se muestran como una lista.',
      type: 'array',
      fieldset: 'panel',
      of: [
        defineArrayMember({
          type: 'string',
          validation: (rule) => rule.max(200).error('Demasiado largo: cada línea, como máximo 200 caracteres.'),
        }),
      ],
      validation: (rule) => rule.max(4).error('Como máximo cuatro puntos clave.'),
    }),
    defineField({
      name: 'metrics',
      title: 'Métricas',
      description: 'Exactamente dos cifras destacadas, con su nombre. Ejemplo: Tráfico orgánico → +148 %',
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
              description: 'Ejemplo: Tráfico orgánico',
              type: 'string',
              validation: (rule) => [
                rule.required().error('Escribe el nombre de la métrica.'),
                rule.max(40).error('Demasiado largo: como máximo 40 caracteres.'),
              ],
            }),
            defineField({
              name: 'value',
              title: 'Cifra',
              description: 'Ejemplo: +148 %',
              type: 'string',
              validation: (rule) => [
                rule.required().error('Escribe la cifra.'),
                rule.max(20).error('Demasiado largo: como máximo 20 caracteres.'),
              ],
            }),
          ],
          preview: { select: { title: 'value', subtitle: 'label' } },
        }),
      ],
      validation: (rule) =>
        rule.required().length(2).error('Hacen falta exactamente dos métricas: el panel tiene dos huecos.'),
    }),
    chart,
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      options: { source: 'name', maxLength: 64 },
      readOnly: lockedOnceSet,
      validation: (rule) => rule.required().error('Pulsa "Generar" para crear el identificador.'),
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
