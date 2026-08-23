import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * A blog post.
 *
 * MODELLED, NOT RENDERED. There is no blog page yet, and `checks/architecture.ts`
 * asserts that nothing in the application imports the generated blog module —
 * the entry chunk has a hard 320,000 B budget and a blog belongs behind
 * route-level lazy loading. The schema exists now so that the format does not
 * have to be invented later against live editorial copy.
 *
 * Video and embeds are boundaries rather than features: no player, no
 * transcoding, only the shape, so an editor who needs them later does not force
 * a content migration to get them.
 */
export const blogPost = defineType({
  name: 'blogPost',
  title: 'Entrada del blog',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Identificador',
      type: 'slug',
      options: { source: 'title', maxLength: 64 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({
      name: 'excerpt',
      title: 'Extracto',
      description: 'Texto plano. Es la tarjeta y la meta descripción, no el primer párrafo.',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.required().max(300),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Fecha de publicación',
      description: 'Ordena el listado, de más reciente a más antigua.',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'cover', title: 'Portada', type: 'imageMedia' }),
    defineField({
      name: 'tags',
      title: 'Etiquetas',
      description: 'Minúsculas, números y guiones: cada etiqueta acabará siendo un segmento de URL.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'string',
          validation: (rule) => rule.regex(/^[a-z0-9][a-z0-9-]{0,63}$/, { name: 'etiqueta' }),
        }),
      ],
      options: { layout: 'tags' },
      validation: (rule) => rule.max(8).unique(),
    }),
    defineField({ name: 'body', title: 'Contenido', type: 'blogBody' }),
  ],
  orderings: [
    {
      name: 'publishedAtDesc',
      title: 'Más recientes primero',
      by: [{ field: 'publishedAt', direction: 'desc' }],
    },
  ],
  preview: { select: { title: 'title', subtitle: 'publishedAt', media: 'cover' } },
})
