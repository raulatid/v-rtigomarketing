import { ImageIcon } from '@sanity/icons/Image'
import { PlayIcon } from '@sanity/icons/Play'
import { LinkIcon } from '@sanity/icons/Link'
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
  icon: ImageIcon,
  type: 'image',
  options: { hotspot: true },
  description: 'PNG, JPG o WebP. No se admiten archivos SVG.',
  fields: [
    defineField({
      name: 'alt',
      title: 'Descripción de la imagen',
      description:
        'Qué se ve en la imagen, en una frase, para quien no puede verla. Ejemplo: Equipo revisando un informe en la oficina',
      type: 'string',
      validation: (rule) => [
        rule.required().error('Describe la imagen en una frase.'),
        rule.max(200).error('Demasiado largo: como máximo 200 caracteres.'),
      ],
    }),
  ],
  validation: (rule) => rule.required().error('Sube una imagen.'),
})

export const videoMedia = defineType({
  name: 'videoMedia',
  title: 'Vídeo (en preparación)',
  icon: PlayIcon,
  type: 'object',
  description: 'Se guarda con la entrada, pero la web todavía no lo reproduce.',
  fields: [
    defineField({
      name: 'src',
      title: 'Dirección del vídeo',
      description: 'La dirección completa del archivo de vídeo, empezando por https://',
      type: 'url',
      validation: (rule) =>
        rule
          .required()
          .uri({ scheme: ['https'] })
          .error('Pega la dirección completa del vídeo, empezando por https://'),
    }),
    defineField({ name: 'poster', type: 'imageMedia', title: 'Imagen de portada del vídeo' }),
  ],
})

export const embedMedia = defineType({
  name: 'embedMedia',
  title: 'Vídeo de YouTube o Vimeo',
  icon: LinkIcon,
  type: 'object',
  // Provider plus url, never pasted markup: the renderer builds its own iframe
  // from parts the build has validated, and the url's host is checked against
  // the provider's allowlist.
  description: 'Pega la dirección del vídeo tal cual aparece en el navegador; no el código de incrustar.',
  fields: [
    defineField({
      name: 'provider',
      title: 'Plataforma',
      type: 'string',
      initialValue: 'youtube',
      options: {
        layout: 'radio',
        direction: 'horizontal',
        list: [
          { title: 'YouTube', value: 'youtube' },
          { title: 'Vimeo', value: 'vimeo' },
        ],
      },
      validation: (rule) => rule.required().error('Elige la plataforma.'),
    }),
    defineField({
      name: 'url',
      title: 'Dirección del vídeo',
      description: 'Ejemplo: https://www.youtube.com/watch?v=abc123 o https://vimeo.com/123456',
      type: 'url',
      validation: (rule) =>
        rule
          .required()
          .uri({ scheme: ['https'] })
          .error('Pega la dirección completa, empezando por https://'),
    }),
  ],
  preview: {
    select: { provider: 'provider', url: 'url' },
    prepare: ({ provider, url }) => ({
      title: provider === 'vimeo' ? 'Vídeo de Vimeo' : 'Vídeo de YouTube',
      subtitle: typeof url === 'string' ? url : '',
    }),
  },
})
