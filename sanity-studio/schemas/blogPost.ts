import { ComposeIcon } from '@sanity/icons/Compose'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { charCount } from '../components/CharCountInput'
import { lockedOnceSet } from './lib/locked'
import { plainText } from './lib/plainText'
import { markupAdvice, singleParagraphAdvice } from './lib/advice'
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
 * Where Google usually truncates. Advisory (`.warning`) and Studio-only — see
 * below — and named so each rule and its counter share one number.
 */
const SEO_TITLE_MAX = 60
const META_DESCRIPTION_MAX = 160

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
 *
 * ── What the descriptions promise, checked against `src/blog/` ──
 * `publishedAt` does not schedule: the query excludes drafts only, so a future
 * date goes live on the next build and sorts to the top. `tags` are chips on
 * the article and search terms — nothing groups or filters by them. YouTube and
 * Vimeo render as a link card (`MediaCard.tsx`), not an iframe. The og:image is
 * cropped from the centre, because no URL builder reads the hotspot. And the
 * slug is the post's public address, so it sits in "Publicación" with a
 * description that says so, rather than in the collapsed "Técnico" box with the
 * "internal name" text the code-welded identifiers share.
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
      title: 'SEO',
      description:
        'Opcional. Controla cómo se ve la entrada en Google y al compartirla. ' +
        'Si lo dejas vacío se usa el título y la entradilla de arriba.',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      description:
        'El titular de la entrada, en el listado y en la propia entrada. También es el título ' +
        'en Google si no rellenas «Meta título».',
      type: 'string',
      fieldset: 'contenido',
      components: { input: charCount(BOUNDS.title) },
      validation: (rule) => [
        rule.required().error('Escribe el título de la entrada.'),
        rule.max(BOUNDS.title).error(`Demasiado largo: como máximo ${BOUNDS.title} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'excerpt',
      title: 'Entradilla',
      description:
        'Dos o tres frases que resumen la entrada. Se lee en la tarjeta del listado y, dentro ' +
        'de la entrada, justo debajo del título.',
      type: 'text',
      rows: 3,
      fieldset: 'contenido',
      components: { input: charCount(BOUNDS.excerpt) },
      validation: (rule) => [
        rule.required().error('Escribe una entradilla.'),
        rule.max(BOUNDS.excerpt).error(`Demasiado largo: como máximo ${BOUNDS.excerpt} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(singleParagraphAdvice).warning(),
      ],
    }),
    defineField({
      name: 'cover',
      title: 'Imagen de portada',
      description:
        'Opcional. La imagen grande que encabeza la entrada y la de su tarjeta en el listado ' +
        '(sin ella, la tarjeta queda con el hueco vacío).',
      type: 'imageMedia',
      fieldset: 'contenido',
    }),
    defineField({
      name: 'body',
      title: 'Texto',
      description:
        'El cuerpo de la entrada. Puedes añadir títulos, listas, citas, enlaces e imágenes. Un ' +
        'vídeo de YouTube o Vimeo se muestra como una tarjeta que abre el vídeo en otra ' +
        'pestaña, no como un reproductor dentro de la página.',
      type: 'blogBody',
      fieldset: 'contenido',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Fecha de publicación',
      description:
        'La fecha que se muestra en la entrada. El blog ordena por ella, de la más reciente a ' +
        'la más antigua. Una fecha futura NO programa la entrada: al publicarla sale igual, ' +
        'con esa fecha y la primera del listado.',
      type: 'datetime',
      fieldset: 'publicacion',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => [
        rule.required().error('Elige una fecha de publicación.'),
        rule.custom((value) => !value || Date.parse(value) <= Date.now() ? true : 'Esta fecha es futura. Para publicar más adelante usa «Programar publicación»; cambiar esta fecha no programa la entrada.').warning(),
      ],
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
      title: 'Etiquetas',
      description:
        'Opcional. Palabras clave que se muestran en la entrada y ayudan a encontrarla con el ' +
        'buscador del blog; no crean secciones ni filtros. En minúsculas y sin espacios: usa ' +
        'guiones. Ejemplo: seo, redes-sociales',
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
        rule.max(BOUNDS.tags).error(`Como máximo ${BOUNDS.tags} etiquetas.`),
        rule.unique().error('Esa etiqueta ya está en la lista.'),
      ],
    }),
    defineField({
      name: 'slug',
      title: 'Dirección de la entrada',
      description:
        'La parte final de la dirección web de la entrada: /blog/<esto>. Pulsa «Generar» para ' +
        'crearla a partir del título. Una vez guardada no cambia, para que los enlaces que se ' +
        'hayan compartido sigan funcionando; si hiciera falta, pídeselo al equipo técnico.',
      type: 'slug',
      // In "Publicación", not the collapsed "Técnico" box the code-welded ids
      // live in: this one is public, and every new post needs "Generar" pressed.
      fieldset: 'publicacion',
      options: slugOptions('title'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule, 'Pulsa «Generar» para crear la dirección.'),
    }),
    defineField({
      name: 'seoTitle',
      title: 'Meta título',
      description:
        'Opcional. El <title> de la entrada, y también og:title y twitter:title. La web le añade ' +
        '« — Vertigo» al final. Vacío, se usa el título de la entrada. Google suele cortar a ' +
        `partir de unos ${SEO_TITLE_MAX} caracteres, contando el añadido.`,
      type: 'string',
      fieldset: 'seo',
      components: { input: charCount(SEO_TITLE_MAX, 'warning') },
      validation: (rule) => [
        rule
          .max(SEO_TITLE_MAX)
          .warning(`Google suele cortar a partir de unos ${SEO_TITLE_MAX} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta descripción',
      description:
        'Opcional. La <meta name="description"> de la entrada, y también og:description y ' +
        'twitter:description. Vacía, se usa la entradilla, recortada a 160 caracteres como máximo. Google ' +
        `suele cortar a partir de unos ${META_DESCRIPTION_MAX} caracteres.`,
      type: 'text',
      rows: 2,
      fieldset: 'seo',
      components: { input: charCount(META_DESCRIPTION_MAX, 'warning') },
      validation: (rule) => [
        rule
          .max(META_DESCRIPTION_MAX)
          .warning(`Google suele cortar a partir de unos ${META_DESCRIPTION_MAX} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(singleParagraphAdvice).warning(),
      ],
    }),
    defineField({
      name: 'ogImage',
      title: 'Imagen Open Graph (og:image)',
      description:
        'Opcional. La og:image de la entrada; twitter:card es summary_large_image. Se recorta a ' +
        '1200 × 630 desde el centro, así que deja lo importante en el medio. Vacía, se usa la ' +
        'imagen de portada de la entrada y, si tampoco hay, la imagen por defecto del sitio.',
      type: 'imageMedia',
      fieldset: 'seo',
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
