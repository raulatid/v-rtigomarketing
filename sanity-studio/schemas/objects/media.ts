import { ImageIcon } from '@sanity/icons/Image'
import { PlayIcon } from '@sanity/icons/Play'
import { LinkIcon } from '@sanity/icons/Link'
import { defineField, defineType } from 'sanity'
import { imageProblem, videoProblem } from '../lib/editorChecks'
import { charCount } from '../../components/CharCountInput'

/**
 * Editorial media.
 *
 * Rules here mirror `docs/content/sanity-media-contract.md` and are enforced
 * again by `content/collections/media.ts` at build time. Two places, on purpose:
 * this one tells the editor while they are working, that one is the guarantee.
 */

/** Both of an image's texts, `alt` and `caption`; shared by rule and counter. */
const IMAGE_TEXT_MAX = 200

export const imageMedia = defineType({
  name: 'imageMedia',
  title: 'Imagen',
  icon: ImageIcon,
  type: 'image',
  options: { hotspot: false, accept: 'image/png,image/jpeg,image/webp' },
  description: 'PNG, JPG o WebP. No se admiten archivos SVG.',
  fields: [
    defineField({
      name: 'alt',
      title: 'Descripción de la imagen',
      description:
        'Qué se ve en la imagen, en una frase, para quien no puede verla. Ejemplo: Equipo revisando un informe en la oficina',
      type: 'string',
      components: { input: charCount(IMAGE_TEXT_MAX) },
      validation: (rule) => [
        rule.required().error('Describe la imagen en una frase.'),
        rule
          .max(IMAGE_TEXT_MAX)
          .error(`Demasiado largo: como máximo ${IMAGE_TEXT_MAX} caracteres.`),
      ],
    }),
    defineField({
      name: 'caption',
      title: 'Pie de foto',
      description:
        'Opcional. El texto que se lee DEBAJO de la imagen, visible para todo el mundo. ' +
        'No repitas aquí la descripción de arriba: esa la lee quien no ve la imagen, y ' +
        'escribir lo mismo en las dos hace que se anuncie dos veces.',
      type: 'string',
      components: { input: charCount(IMAGE_TEXT_MAX) },
      validation: (rule) =>
        rule.max(IMAGE_TEXT_MAX).error(`Demasiado largo: como máximo ${IMAGE_TEXT_MAX} caracteres.`),
    }),
  ],
  // NOT `required()`, and not `assetRequired()` either.
  //
  // `required()` checks that a VALUE is present, not that an image is attached,
  // so `{alt: 'una foto'}` — what Sanity leaves behind when an editor writes the
  // description and never uploads the file — satisfies it, publishes, and fails
  // the build instead. It is also too strict in the other direction: `cover` and
  // `ogImage` are optional by intent, and a required error on an empty optional
  // field is what pushes an editor into filling it with something.
  //
  // `assetRequired()` is `!value || !value.asset || !value.asset._ref`, so it
  // fires on the empty optional field too. Hence the explicit rule: say nothing
  // about an untouched field, reject a half-filled one.
  validation: (rule) => rule.custom(imageProblem),
})

/**
 * A self-hosted video file. NO LONGER OFFERED in `blogBody` — see richText.ts.
 *
 * Still defined and registered, unused, because the build's contract
 * (`content/collections/media.ts`) still accepts the shape; the two go together
 * when the hidden fields are removed end-to-end. It rendered as a link card, not
 * a player, and filling `poster` failed the build (the projection never resolves
 * the poster's asset URL), so `poster` is hidden as well.
 */
export const videoMedia = defineType({
  name: 'videoMedia',
  title: 'Enlace a un archivo de vídeo',
  icon: PlayIcon,
  type: 'object',
  description: 'Se muestra como una tarjeta con enlace, no como un reproductor.',
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
    defineField({
      name: 'poster',
      type: 'imageMedia',
      title: 'Imagen de portada del vídeo',
      hidden: true,
    }),
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
  description:
    'En la entrada se ve como una tarjeta que abre el vídeo en otra pestaña. Pega la ' +
    'dirección del vídeo tal cual aparece en el navegador, no el código de incrustar.',
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
      validation: (rule) => [
        rule.required().uri({ scheme: ['https'] }).error('Pega la dirección completa, empezando por https://'),
        rule.custom((value, context) => videoProblem(value, (context.parent as { provider?: string })?.provider)),
      ],
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
