import { defineArrayMember, defineField, defineType } from 'sanity'
import { EDITORIAL_BOUNDS } from '../../../src/content/editorialBounds'
import { SubtitleStyle, TitleStyle } from '../../components/HeadingStyle'
import { legalHeadingsAdvice, legalLengthAdvice } from '../lib/legalBody'
import { richText } from '../lib/plainText'

/**
 * The shared rich-text vocabulary.
 *
 * DELIBERATELY SMALL. `content/lib/portableText.ts` converts what an editor
 * writes into the typed blocks `src/content/types.ts` declares, and it FAILS THE
 * BUILD on a style, mark or annotation it does not know. So every option offered
 * here has to have a matching case there — an editor must never be able to reach
 * for something that will later refuse to publish.
 *
 * There is no raw-HTML block and there never should be. Structure is what makes
 * this safe; the moment a field carries markup, the renderer has to trust the
 * CMS, and that is the thing this whole pipeline is arranged to avoid.
 */

const decorators = [
  { title: 'Negrita', value: 'strong' },
  { title: 'Cursiva', value: 'em' },
]

// `defineType`/`defineField` rather than bare object literals: the annotation is
// what carries the URL allowlist, and a literal loses the typing on `rule` —
// which is exactly the argument that should not be written against `any`.
const link = defineType({
  name: 'link',
  type: 'object',
  title: 'Enlace',
  fields: [
    defineField({
      name: 'href',
      type: 'url',
      title: 'Dirección',
      description:
        'La dirección completa, empezando por https://. Para un correo, escribe mailto: seguido de la dirección. ' +
        'Ejemplo: https://www.aepd.es o mailto:hola@vertigomarketing.es',
      // Matches the ingest allowlist exactly. `javascript:` and `data:` are
      // rejected at build time regardless; refusing them here means the editor
      // finds out while typing rather than from a failed deployment.
      validation: (rule) =>
        rule
          .required()
          .uri({ scheme: ['https', 'mailto'] })
          .error('Pega la dirección completa, empezando por https:// (o mailto: para un correo).'),
    }),
  ],
})

/**
 * Paragraphs, two heading levels, lists, bold, italic, links. Nothing else.
 *
 * The block cap is the build's (`LEGAL_POLICY.maxBlocks`), through the shared
 * table, and is a net rather than a length. Length and headings are advised,
 * never refused — schemas/lib/legalBody.ts says why.
 */
export const legalBody = defineType({
  name: 'legalBody',
  title: 'Texto legal',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Párrafo', value: 'normal' },
        { title: 'Título', value: 'h2', component: TitleStyle },
        { title: 'Subtítulo', value: 'h3', component: SubtitleStyle },
      ],
      lists: [
        { title: 'Lista', value: 'bullet' },
        { title: 'Lista numerada', value: 'number' },
      ],
      marks: { decorators, annotations: [link] },
    }),
  ],
  validation: (rule) => [
    rule.required().min(1).error('El documento no puede estar vacío.'),
    rule
      .max(EDITORIAL_BOUNDS.legalDoc.bodyBlocks)
      .error(
        `El documento tiene más de ${EDITORIAL_BOUNDS.legalDoc.bodyBlocks} bloques. ` +
          'Es mucho más de lo que cabe en cualquier texto legal: comprueba que no se haya pegado un documento entero por error.',
      ),
    rule.custom(richText),
    rule.custom(legalHeadingsAdvice).warning(),
    rule.custom(legalLengthAdvice).warning(),
  ],
})

/**
 * As above, plus pull quotes, images and YouTube/Vimeo links.
 *
 * `videoMedia` is deliberately NOT offered. It rendered as the same link card an
 * embed does, under a title promising a player "en preparación", and its poster
 * field failed the build. The published dataset held none when it was taken out
 * (checked 2026-09-11), so no existing post loses a block.
 */
export const blogBody = defineType({
  name: 'blogBody',
  title: 'Texto',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Párrafo', value: 'normal' },
        { title: 'Título', value: 'h2' },
        { title: 'Subtítulo', value: 'h3' },
        { title: 'Cita', value: 'blockquote' },
      ],
      lists: [
        { title: 'Lista', value: 'bullet' },
        { title: 'Lista numerada', value: 'number' },
      ],
      marks: { decorators, annotations: [link] },
    }),
    defineArrayMember({ type: 'imageMedia' }),
    defineArrayMember({ type: 'embedMedia' }),
  ],
  validation: (rule) => [
    rule.required().min(1).error('La entrada no puede estar vacía.'),
    rule
      .max(EDITORIAL_BOUNDS.blogPost.bodyBlocks)
      .error(
        `La entrada tiene más de ${EDITORIAL_BOUNDS.blogPost.bodyBlocks} bloques (párrafos, títulos, listas, imágenes). ` +
          'Es más de lo que se lee de una vez: divídela en dos entradas.',
      ),
    rule.custom(richText),
  ],
})
