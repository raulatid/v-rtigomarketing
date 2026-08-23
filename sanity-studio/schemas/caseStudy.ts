import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * A case study — one of the brands riding an orbit around the Earth.
 *
 * ── What is NOT here ──
 * Which orbit a case occupies. That is scene composition and lives in
 * `src/experiences/earth/orbit/orbitAssignments.ts`. Publishing a case study
 * does NOT create an orbit: the Earth keeps a finite, art-directed set of slots,
 * and a CMS that could author them would be able to rearrange a hand-tuned
 * composition.
 *
 * ── The bounds are layout facts ──
 * `details` is a four-line bullet list, `metrics` is a fixed two-up grid, and
 * chart values are normalised into 340 SVG units. Over-length is REJECTED by the
 * build rather than trimmed, because a silently shortened case study is a
 * content bug that looks like a rendering bug.
 */

const chart = defineField({
  name: 'chart',
  title: 'Gráfico',
  type: 'object',
  validation: (rule) => rule.required(),
  fields: [
    defineField({
      name: 'type',
      title: 'Tipo',
      type: 'string',
      options: {
        list: [
          { title: 'Línea', value: 'line' },
          { title: 'Barras', value: 'bars' },
          { title: 'Área', value: 'area' },
          { title: 'Donut', value: 'donut' },
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'values',
      title: 'Valores',
      type: 'array',
      of: [defineArrayMember({ type: 'number' })],
      validation: (rule) => rule.required().min(1).max(16),
    }),
    defineField({
      name: 'labels',
      title: 'Etiquetas',
      description:
        'Obligatorias para barras y donut: una por valor. Sin ellas el gráfico se dibuja sin ejes ni leyenda, que es peor que fallar.',
      type: 'array',
      of: [defineArrayMember({ type: 'string' })],
      validation: (rule) => rule.max(16),
    }),
  ],
})

export const caseStudy = defineType({
  name: 'caseStudy',
  title: 'Caso de éxito',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Identificador',
      type: 'slug',
      description:
        'Se proyecta como el id del caso, y orbitAssignments.ts lo referencia. Cambiarlo rompe esa referencia y falla la build.',
      options: { source: 'name', maxLength: 64 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'name',
      title: 'Marca',
      type: 'string',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'label',
      title: 'Etiqueta',
      description: 'Opcional. Si se deja vacía se usa la marca.',
      type: 'string',
      validation: (rule) => rule.max(60),
    }),
    defineField({
      name: 'logo',
      title: 'Logotipo',
      description:
        'PNG o WebP con fondo transparente, 1024×512 o menor. Se copia a la web durante la build; no se enlaza desde el CDN. Sin logotipo se dibuja una placa con el color de marca.',
      type: 'image',
    }),
    defineField({
      name: 'brandColor',
      title: 'Color de marca',
      description:
        'Hexadecimal de seis dígitos. Se dibuja en un canvas, así que otro formato sale del color equivocado en lugar de fallar.',
      type: 'string',
      validation: (rule) => rule.required().regex(/^#[0-9a-fA-F]{6}$/, { name: 'hexadecimal' }),
    }),
    defineField({
      name: 'sector',
      title: 'Sector',
      type: 'string',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'location',
      title: 'Ubicación',
      type: 'string',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'year',
      title: 'Año',
      type: 'string',
      validation: (rule) => rule.required().max(16),
    }),
    defineField({
      name: 'summary',
      title: 'Resumen',
      type: 'text',
      rows: 4,
      validation: (rule) => rule.required().max(400),
    }),
    defineField({
      name: 'details',
      title: 'Detalles',
      description: 'Como máximo cuatro líneas cortas: es una lista de viñetas de altura fija.',
      type: 'array',
      of: [defineArrayMember({ type: 'string', validation: (rule) => rule.max(200) })],
      validation: (rule) => rule.max(4),
    }),
    defineField({
      name: 'metrics',
      title: 'Métricas',
      description:
        'Exactamente dos: la fila de métricas del panel es una rejilla fija de dos columnas.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'label',
              title: 'Etiqueta',
              type: 'string',
              validation: (rule) => rule.required().max(40),
            }),
            defineField({
              name: 'value',
              title: 'Valor',
              type: 'string',
              validation: (rule) => rule.required().max(20),
            }),
          ],
        }),
      ],
      validation: (rule) => rule.required().length(2),
    }),
    chart,
  ],
  preview: { select: { title: 'name', subtitle: 'sector', media: 'logo' } },
})
