import { ComposeIcon } from '@sanity/icons/Compose'
import { defineArrayMember, defineField, defineType } from 'sanity'
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
const BOUNDS = EDITORIAL_BOUNDS.blogPost

/**
 * A blog post.
 *
 * RENDERED since `adr/013` — at `/blog` and `/blog/<identificador>`, from a
 * document of its own so a reader never pays for the 3D scene. The fieldset
 * description that used to warn the editor their work was invisible is gone with
 * it; leaving it would be worse than never having written it.
 *
 * ── Two fields the build treats differently from this schema ──
 *
 * `seoTitle` and `metaDescription` warn rather than error at 60 and 160. Those
 * are where Google truncates, not where content stops being valid, so the build
 * publishes them at any length. A Studio that says "fine" and a deploy that then
 * fails is the worst arrangement available.
 *
 * `category` is REQUIRED here and nullable in the build. Posts that predate the
 * field exist, and failing every deployment until someone opens each one is not
 * a migration plan. See `content/collections/blogPosts.collection.ts`.
 */
export const blogPost = defineType({
  name: 'blogPost',
  title: 'Entrada del blog',
  icon: ComposeIcon,
  type: 'document',
  fieldsets: [
    { name: 'contenido', title: 'Contenido' },
    { name: 'publicacion', title: 'Publicación' },
    {
      name: 'seo',
      title: 'Buscadores y redes',
      description:
        'Opcional. Controla cómo se ve la entrada en Google y al compartirla. ' +
        'Si lo dejas vacío se usa el título y la entradilla de arriba.',
      options: { collapsible: true, collapsed: true },
    },
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
        rule.max(BOUNDS.title).error(`Demasiado largo: como máximo ${BOUNDS.title} caracteres.`),
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
        rule.max(BOUNDS.excerpt).error(`Demasiado largo: como máximo ${BOUNDS.excerpt} caracteres.`),
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
      name: 'category',
      title: 'Tema principal',
      description:
        'El servicio del que trata la entrada. Es lo que aparece encima del título y lo que ' +
        'agrupa las entradas en el listado del blog.',
      type: 'reference',
      to: [{ type: 'service' }],
      fieldset: 'publicacion',
      validation: (rule) => rule.required().error('Elige el tema principal de la entrada.'),
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
        rule.max(BOUNDS.tags).error(`Como máximo ${BOUNDS.tags} temas.`),
        rule.unique().error('Ese tema ya está en la lista.'),
      ],
    }),
    defineField({
      name: 'seoTitle',
      title: 'Título para buscadores',
      description:
        'Opcional. Si lo dejas vacío se usa el título de la entrada. Google suele cortar a ' +
        'partir de unos 60 caracteres.',
      type: 'string',
      fieldset: 'seo',
      validation: (rule) =>
        rule.max(60).warning('Google suele cortar a partir de unos 60 caracteres.'),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Descripción para buscadores',
      description:
        'Opcional. Si la dejas vacía se usa la entradilla. Google suele cortar a partir de ' +
        'unos 160 caracteres.',
      type: 'text',
      rows: 2,
      fieldset: 'seo',
      validation: (rule) =>
        rule.max(160).warning('Google suele cortar a partir de unos 160 caracteres.'),
    }),
    defineField({
      name: 'ogImage',
      title: 'Imagen para redes sociales',
      description:
        'Opcional. La imagen que se ve al compartir la entrada. Si la dejas vacía se usa la ' +
        'de portada. Se recorta a 1200 × 630.',
      type: 'imageMedia',
      fieldset: 'seo',
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
