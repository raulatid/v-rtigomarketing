import { defineArrayMember, defineType } from 'sanity'

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

const link = {
  name: 'link',
  type: 'object',
  title: 'Enlace',
  fields: [
    {
      name: 'href',
      type: 'url',
      title: 'Destino',
      // Matches the ingest allowlist exactly. `javascript:` and `data:` are
      // rejected at build time regardless; refusing them here means the editor
      // finds out while typing rather than from a failed deployment.
      validation: (rule: any) => rule.required().uri({ scheme: ['https', 'mailto'] }),
    },
  ],
}

/** Paragraphs, two heading levels, lists, bold, italic, links. Nothing else. */
export const legalBody = defineType({
  name: 'legalBody',
  title: 'Contenido legal',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Párrafo', value: 'normal' },
        { title: 'Título', value: 'h2' },
        { title: 'Subtítulo', value: 'h3' },
      ],
      lists: [
        { title: 'Lista', value: 'bullet' },
        { title: 'Lista numerada', value: 'number' },
      ],
      marks: { decorators, annotations: [link] },
    }),
  ],
  validation: (rule) => rule.required().min(1).max(120),
})

/** As above, plus pull quotes, images, video and embeds. */
export const blogBody = defineType({
  name: 'blogBody',
  title: 'Contenido',
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
    defineArrayMember({ type: 'videoMedia' }),
    defineArrayMember({ type: 'embedMedia' }),
  ],
  validation: (rule) => rule.required().min(1).max(400),
})
