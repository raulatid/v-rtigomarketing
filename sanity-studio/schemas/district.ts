import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * A district — the copy behind one interactive area of the city.
 *
 * ── What is NOT here ──
 * No Blender node names, no camera yaw, no world rectangles. Those live in
 * `src/experiences/murcia/scene/cityDistrictBindings.ts` and change when the GLB
 * is re-exported, not when marketing writes. Mixing them would put a marketing
 * edit one typo away from breaking asset resolution.
 *
 * The identifier must match a `contentId` in that file, so it is not a free
 * choice: a district whose id nothing binds is unreachable in the scene.
 */
export const district = defineType({
  name: 'district',
  title: 'Distrito',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Identificador',
      type: 'slug',
      description:
        'Debe coincidir con un contentId de cityDistrictBindings.ts. Cambiarlo deja el distrito sin escena.',
      options: { source: 'label', maxLength: 64 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'label',
      title: 'Nombre',
      type: 'string',
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: 'summary',
      title: 'Resumen',
      description:
        'Una sola frase, 140 caracteres como máximo: es lo que se ve en móvil cuando el panel ocupa el 40% de la pantalla. Se rechaza en lugar de recortarse.',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required().max(140),
    }),
    defineField({
      name: 'intro',
      title: 'Introducción',
      type: 'text',
      rows: 5,
      validation: (rule) => rule.required().max(600),
    }),
    defineField({
      name: 'services',
      title: 'Servicios',
      description:
        'Al menos uno: el panel abre la primera sección, y sin servicios no abre nada y parece roto.',
      type: 'array',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'service' }] })],
      validation: (rule) => rule.required().min(1).max(12).unique(),
    }),
  ],
  preview: { select: { title: 'label', subtitle: 'summary' } },
})
