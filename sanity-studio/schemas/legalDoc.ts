import { defineField, defineType } from 'sanity'

/**
 * A legal document.
 *
 * Two of these exist, at the fixed ids `legal-terms` and `legal-notice` (no
 * dots — a dotted _id is invisible to unauthenticated reads), and
 * `legalDocs.collection.ts` fails the build if either is missing — the footer
 * links to both by name, so a deleted one leaves a link pointing at nothing.
 * Which documents exist is app composition; the TEXT is entirely editorial.
 *
 * The body is `legalBody`: paragraphs, two heading levels, lists, bold, italic
 * and links to https or mailto. No images, no embeds, no raw HTML — a privacy
 * notice that needs an embedded video is not a privacy notice, and every option
 * offered here has a matching case in the ingestion layer. Anything else fails
 * the build rather than publishing a document missing a clause.
 */
export const legalDoc = defineType({
  name: 'legalDoc',
  title: 'Documento legal',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Identificador',
      type: 'slug',
      description:
        'terminos o aviso. La aplicación enlaza estos dos nombres; otro valor deja el documento sin enlace.',
      options: { source: 'title', maxLength: 64 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({ name: 'body', title: 'Contenido', type: 'legalBody' }),
  ],
  preview: { select: { title: 'title', subtitle: 'slug.current' } },
})
