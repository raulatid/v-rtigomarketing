import { ComposeIcon } from '@sanity/icons/Compose'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'
import { slugOptions, slugValidation } from './lib/slug'

/**
 * A blog post.
 *
 * MODELLED, NOT RENDERED. There is no blog page yet, and `checks/architecture.ts`
 * asserts that nothing in the application imports the generated blog module —
 * the entry chunk has a hard 320,000 B budget and a blog belongs behind
 * route-level lazy loading. The schema exists now so that the format does not
 * have to be invented later against live editorial copy.
 *
 * The editor is told this in the first fieldset's description, in plain words,
 * because a section that accepts posts and shows them nowhere is the kind of
 * thing that costs someone an afternoon.
 */
export const blogPost = defineType({
  name: 'blogPost',
  title: 'Entrada del blog',
  icon: ComposeIcon,
  type: 'document',
  fieldsets: [
    {
      name: 'contenido',
      title: 'Contenido',
      description:
        'Aviso: el blog todavía no se muestra en la web. Lo que escribas aquí se guarda y ' +
        'aparecerá cuando la sección del blog esté lista.',
    },
    { name: 'publicacion', title: 'Publicación' },
    TECH_FIELDSET,
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      fieldset: 'contenido',
      validation: (rule) => [
        rule.required().error('Escribe el título de la entrada.'),
        rule.max(120).error('Demasiado largo: como máximo 120 caracteres.'),
      ],
    }),
    defineField({
      name: 'excerpt',
      title: 'Entradilla',
      description:
        'Dos o tres frases que resumen la entrada. Es lo que se ve en el listado, antes de abrirla.',
      type: 'text',
      rows: 3,
      fieldset: 'contenido',
      validation: (rule) => [
        rule.required().error('Escribe una entradilla.'),
        rule.max(300).error('Demasiado largo: como máximo 300 caracteres.'),
      ],
    }),
    defineField({
      name: 'cover',
      title: 'Imagen de portada',
      description: 'Opcional. La imagen grande que encabeza la entrada.',
      type: 'imageMedia',
      fieldset: 'contenido',
    }),
    defineField({
      name: 'body',
      title: 'Texto',
      description:
        'El cuerpo de la entrada. Puedes añadir títulos, listas, citas, enlaces, imágenes y vídeos de YouTube o Vimeo.',
      type: 'blogBody',
      fieldset: 'contenido',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Fecha de publicación',
      description: 'Las entradas se ordenan por esta fecha, de la más reciente a la más antigua.',
      type: 'datetime',
      fieldset: 'publicacion',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required().error('Elige una fecha de publicación.'),
    }),
    defineField({
      name: 'tags',
      title: 'Temas',
      description:
        'Palabras clave para agrupar entradas. En minúsculas y sin espacios: usa guiones. Ejemplo: seo, redes-sociales',
      type: 'array',
      fieldset: 'publicacion',
      of: [
        defineArrayMember({
          type: 'string',
          validation: (rule) =>
            rule
              .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
              .error('Solo minúsculas, números y guiones, sin espacios. Ejemplo: redes-sociales'),
        }),
      ],
      options: { layout: 'tags' },
      validation: (rule) => [
        rule.max(8).error('Como máximo 8 temas.'),
        rule.unique().error('Ese tema ya está en la lista.'),
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
  orderings: [
    {
      name: 'publishedAtDesc',
      title: 'Más recientes primero',
      by: [{ field: 'publishedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', publishedAt: 'publishedAt', media: 'cover' },
    prepare: ({ title, publishedAt, media }) => ({
      title,
      media,
      subtitle:
        typeof publishedAt === 'string'
          ? new Date(publishedAt).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : 'Sin fecha',
    }),
  },
})
