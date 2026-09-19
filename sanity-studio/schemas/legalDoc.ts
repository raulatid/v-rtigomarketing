import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { defineField, defineType } from 'sanity'
import { charCount } from '../components/CharCountInput'
import { LegalBodyInput } from '../components/LegalBodyInput'
import { LOCKED_ID_DESCRIPTION, TECH_FIELDSET, lockedOnceSet } from './lib/locked'
import { slugOptions, slugValidation } from './lib/slug'
import { plainText } from './lib/plainText'
import { markupAdvice } from './lib/advice'
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
const BOUNDS = EDITORIAL_BOUNDS.legalDoc

/**
 * A legal document.
 *
 * Three of these exist, at the fixed ids `legal-terms`, `legal-notice` and
 * `legal-cookies` (no dots — a dotted _id is invisible to unauthenticated
 * reads), and `legalDocs.collection.ts` fails the build if any is missing — the
 * site links to each by name (the audit panel to terms and notice, the Contacto
 * dialog to terms, the consent banner to cookies), and opens it in a modal
 * (`LegalPanel.tsx`), never a page. Which documents exist is app composition; the TEXT is
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
      description: 'El título de la ventana en la que se abre el documento.',
      type: 'string',
      placeholder: 'Aviso legal',
      components: { input: charCount(BOUNDS.title) },
      validation: (rule) => [
        rule.required().error('Escribe el título.'),
        rule.max(BOUNDS.title).error(`Demasiado largo: como máximo ${BOUNDS.title} caracteres.`),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
      ],
    }),
    defineField({
      name: 'body',
      title: 'Texto',
      description:
        'El documento completo. Se abre en una ventana sobre la web cuando alguien pulsa su enlace. ' +
        'Para un título de sección, pon el cursor en su línea y elige «Título» en el desplegable de estilo ' +
        '(el que dice «Párrafo»): la negrita sola no lo convierte en título. ' +
        'Admite listas, negrita, cursiva y enlaces; no admite imágenes ni vídeos. ' +
        'Comprueba cómo queda en la pestaña «Vista previa».',
      type: 'legalBody',
      // On the field rather than the type: an array type's `components.input`
      // is typed for primitives, and the field alias is where the string inputs
      // above hang theirs anyway.
      components: { input: LegalBodyInput },
    }),
    defineField({
      name: 'slug',
      title: 'Identificador',
      description: LOCKED_ID_DESCRIPTION,
      type: 'slug',
      fieldset: 'tecnico',
      options: slugOptions('title'),
      readOnly: lockedOnceSet,
      validation: (rule) => slugValidation(rule, 'Este identificador lo fija el equipo técnico («terminos», «aviso» o «cookies»). Si aparece vacío, no pulses «Generar»: avísales.'),
    }),
  ],
  preview: {
    select: { title: 'title' },
    prepare: ({ title }) => ({ title, subtitle: 'Documento legal' }),
  },
})
