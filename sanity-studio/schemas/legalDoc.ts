import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { defineField, defineType } from 'sanity'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'
import { slugOptions, slugValidation } from './lib/slug'

/**
 * A legal document.
 *
 * Two of these exist, at the fixed ids `legal-terms` and `legal-notice` (no
 * dots — a dotted _id is invisible to unauthenticated reads), and
 * `legalDocs.collection.ts` fails the build if either is missing — the footer
 * links to both by name. Which documents exist is app composition; the TEXT is
 * entirely editorial. `sanity.config.ts` removes create/duplicate/delete.
 *
 * The body is `legalBody`: paragraphs, two heading levels, lists, bold, italic
 * and links to https or mailto. Every option offered there has a matching case
 * in the ingestion layer; anything else fails the build rather than publishing
 * a document missing a clause.
 */
export const legalDoc = defineType({
  name: 'legalDoc',
  title: 'Documento legal',
  icon: DocumentTextIcon,
  type: 'document',
  fieldsets: [TECH_FIELDSET],
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      description: 'Tal y como se muestra al abrir el documento. Ejemplo: Aviso legal.',
      type: 'string',
      validation: (rule) => [
        rule.required().error('Escribe el título.'),
        rule.max(80).error('Demasiado largo: como máximo 80 caracteres.'),
      ],
    }),
    defineField({
      name: 'body',
      title: 'Texto',
      description:
        'El documento completo. Puedes usar títulos, listas, negrita y enlaces; no admite imágenes ni vídeos.',
      type: 'legalBody',
    }),
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      options: slugOptions('title'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule),
    }),
  ],
  preview: {
    select: { title: 'title' },
    prepare: ({ title }) => ({ title, subtitle: 'Documento legal' }),
  },
})
