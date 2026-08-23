import { defineField, defineType } from 'sanity'

/**
 * Editorial media.
 *
 * Rules here mirror `docs/content/sanity-media-contract.md` and are enforced
 * again by `content/collections/media.ts` at build time. Two places, on purpose:
 * this one tells the editor while they are working, that one is the guarantee.
 */

export const imageMedia = defineType({
  name: 'imageMedia',
  title: 'Imagen',
  type: 'image',
  options: { hotspot: true },
  fields: [
    defineField({
      name: 'alt',
      type: 'string',
      title: 'Texto alternativo',
      description:
        'Qué muestra la imagen, para quien no puede verla. Obligatorio: una imagen puramente decorativa no debería estar en el CMS.',
      validation: (rule) => rule.required().max(200),
    }),
  ],
  // SVG is refused at build time as stored XSS. Saying so here saves the editor
  // an upload and a failed deployment to find out.
  description: 'PNG o WebP. SVG no está permitido.',
  validation: (rule) => rule.required(),
})

export const videoMedia = defineType({
  name: 'videoMedia',
  title: 'Vídeo',
  type: 'object',
  description: 'Modelado, todavía sin reproductor en la web.',
  fields: [
    defineField({
      name: 'src',
      type: 'url',
      title: 'URL del vídeo',
      validation: (rule) => rule.required().uri({ scheme: ['https'] }),
    }),
    defineField({ name: 'poster', type: 'imageMedia', title: 'Miniatura' }),
  ],
})

export const embedMedia = defineType({
  name: 'embedMedia',
  title: 'Vídeo incrustado',
  type: 'object',
  // Provider plus url, never pasted markup: the renderer builds its own iframe
  // from parts the build has validated, and the url's host is checked against
  // the provider's allowlist.
  description: 'Solo YouTube o Vimeo. Pega la URL, no el código de incrustar.',
  fields: [
    defineField({
      name: 'provider',
      type: 'string',
      title: 'Plataforma',
      options: { list: [{ title: 'YouTube', value: 'youtube' }, { title: 'Vimeo', value: 'vimeo' }] },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'url',
      type: 'url',
      title: 'URL',
      validation: (rule) => rule.required().uri({ scheme: ['https'] }),
    }),
  ],
})
