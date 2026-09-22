import { PresentationIcon } from '@sanity/icons/Presentation'
import { defineArrayMember, defineField, defineType, type ValidationContext } from 'sanity'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { charCount } from '../components/CharCountInput'
import { markupAdvice, singleParagraphAdvice } from './lib/advice'
import { plainText } from './lib/plainText'
import {
  caption1Advice,
  captionAdvice,
  headlineAdvice,
  listItemAdvice,
  metricAdvice,
  rotationAdvice,
  singleSlideAdvice,
} from './lib/towerAdvice'
import { towerImageAdvice, towerImageErrors } from './lib/towerImage'

/**
 * The lengths this schema refuses, shared with the content build. See
 * `src/content/editorialBounds.ts` for where each number was measured.
 */
const BOUNDS = EDITORIAL_BOUNDS.towerScreen

/**
 * One slide of the tower's LED screen: a fixed template with named slots.
 *
 * The site places every slot on the facade itself
 * (`layoutTowerSlides.ts`); nothing here is a position. An editor who leaves
 * a slot empty gets a slide without it, and the rest stays where it was.
 *
 * The descriptions say where each slot lands, in the visitor's words, so an
 * editor can picture the wall while filling the form. The character limits
 * are the measured width of that wall — a canvas clips overflow in silence,
 * so the Studio refuses it here and the build refuses it again.
 */
const towerSlide = defineArrayMember({
  name: 'towerSlide',
  title: 'Diapositiva',
  type: 'object',
  fields: [
    defineField({
      name: 'headline',
      title: 'Titular',
      type: 'string',
      description:
        'La palabra grande de arriba, en mayúsculas en la pantalla. Como máximo ' + BOUNDS.headline + ' caracteres.',
      components: { input: charCount(BOUNDS.headline) },
      validation: (rule) => [
        rule.required().error('Escribe el titular: es lo único imprescindible de una diapositiva.'),
        rule.max(BOUNDS.headline).error('Como máximo ' + BOUNDS.headline + ' caracteres: más no cabe en el ancho de la torre.'),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(singleParagraphAdvice).warning(),
        rule.custom(headlineAdvice).warning(),
      ],
    }),
    defineField({
      name: 'items',
      title: 'Líneas',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'string',
          validation: (rule) => [
            rule.required().error('Escribe la línea, o quítala.'),
            rule.max(BOUNDS.listItem).error('Como máximo ' + BOUNDS.listItem + ' caracteres por línea.'),
            rule.custom(plainText),
            rule.custom(markupAdvice).warning(),
            rule.custom(listItemAdvice).warning(),
          ],
        }),
      ],
      description:
        'Hasta ' + BOUNDS.listItems + ' palabras o frases cortas bajo el titular, una por línea; la primera se ve más clara. Puedes no poner ninguna.',
      validation: (rule) => rule.max(BOUNDS.listItems).error('Como máximo ' + BOUNDS.listItems + ' líneas: la cuarta pisaría la imagen.'),
    }),
    defineField({
      name: 'metricValue',
      title: 'Cifra',
      type: 'number',
      description:
        'Un número entero grande en la parte baja, que sube contando hasta su valor. Déjalo vacío si esta diapositiva no lleva cifra.',
      validation: (rule) => [
        rule.integer().error('Un número entero, sin decimales: la pantalla lo cuenta de uno en uno.'),
        rule.min(-BOUNDS.metricValueMax).max(BOUNDS.metricValueMax).error('Como máximo ' + BOUNDS.metricValueMax + '.'),
      ],
    }),
    defineField({
      name: 'metricPrefix',
      title: 'Delante de la cifra',
      type: 'string',
      description: 'Un signo, p. ej. «−» o «+». Como máximo ' + BOUNDS.metricAffix + ' caracteres.',
      validation: (rule) => [
        rule.max(BOUNDS.metricAffix).error('Como máximo ' + BOUNDS.metricAffix + ' caracteres.'),
        rule.custom(plainText),
        rule.custom(affixNeedsFigure),
      ],
    }),
    defineField({
      name: 'metricSuffix',
      title: 'Detrás de la cifra',
      type: 'string',
      description: 'Una unidad, p. ej. «%» o «×». Como máximo ' + BOUNDS.metricAffix + ' caracteres.',
      validation: (rule) => [
        rule.max(BOUNDS.metricAffix).error('Como máximo ' + BOUNDS.metricAffix + ' caracteres.'),
        rule.custom(plainText),
        rule.custom(affixNeedsFigure),
      ],
    }),
    defineField({
      name: 'caption1',
      title: 'Pie 1',
      type: 'string',
      description: 'Justo bajo la cifra, en mayúsculas. Como máximo ' + BOUNDS.caption1 + ' caracteres.',
      components: { input: charCount(BOUNDS.caption1) },
      validation: (rule) => [
        rule.max(BOUNDS.caption1).error('Como máximo ' + BOUNDS.caption1 + ' caracteres.'),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(caption1Advice).warning(),
      ],
    }),
    defineField({
      name: 'caption2',
      title: 'Pie 2',
      type: 'string',
      description: 'Segunda línea bajo la cifra, más pequeña y apagada. Como máximo ' + BOUNDS.caption + ' caracteres.',
      components: { input: charCount(BOUNDS.caption) },
      validation: (rule) => [
        rule.max(BOUNDS.caption).error('Como máximo ' + BOUNDS.caption + ' caracteres.'),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(captionAdvice).warning(),
      ],
    }),
    defineField({
      name: 'caption3',
      title: 'Pie 3',
      type: 'string',
      description: 'Tercera línea bajo la cifra, como la segunda. Como máximo ' + BOUNDS.caption + ' caracteres.',
      components: { input: charCount(BOUNDS.caption) },
      validation: (rule) => [
        rule.max(BOUNDS.caption).error('Como máximo ' + BOUNDS.caption + ' caracteres.'),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(captionAdvice).warning(),
      ],
    }),
    defineField({
      name: 'image',
      title: 'Imagen',
      type: 'image',
      description:
        'La franja central de la pantalla, fundida con la pared. JPG, PNG o WebP; mejor vertical, de al menos ' +
        BOUNDS.imageMinWidthAdvised + ' píxeles de ancho. No uses previsualizaciones de bancos de imágenes con marca de agua. ' +
        'Puedes dejarla vacía: la diapositiva se muestra solo con texto.',
      options: { hotspot: false, accept: 'image/png,image/jpeg,image/webp' },
      validation: (rule) => [
        rule.custom(towerImageErrors),
        rule.custom((value, context) => towerImageAdvice(value, siblingFit(context))).warning(),
      ],
    }),
    defineField({
      name: 'imageFit',
      title: 'Encuadre',
      type: 'string',
      initialValue: 'cover',
      options: {
        layout: 'radio',
        list: [
          { title: 'Rellenar el hueco (recorta la foto)', value: 'cover' },
          { title: 'Mostrar la imagen entera (deja aire alrededor)', value: 'contain' },
        ],
      },
      hidden: ({ parent }) => !(parent as { image?: { asset?: unknown } } | undefined)?.image?.asset,
    }),
  ],
  validation: (rule) => rule.custom(metricAdvice).warning(),
  preview: {
    select: { title: 'headline', subtitle: 'items.0', media: 'image' },
  },
})

/**
 * A sign or a unit beside an empty figure is half a figure. The build says
 * the same thing; here it is said before Publicar, at the field.
 */
function affixNeedsFigure(value: unknown, context: ValidationContext): true | string {
  if (typeof value !== 'string' || value.trim().length === 0) return true
  const figure = (context.parent as { metricValue?: unknown } | undefined)?.metricValue
  if (typeof figure === 'number') return true
  return 'Has escrito algo junto a la cifra pero no hay cifra. Escribe el número, o borra esto.'
}

function siblingFit(context: ValidationContext): unknown {
  return (context.parent as { imageFit?: unknown } | undefined)?.imageFit
}

/**
 * The tower's LED screen.
 *
 * A SINGLETON, presented as one document by `sanity.config.ts` — a convenience,
 * not a guarantee: `towerScreen.collection.ts` asserts the count at build
 * time, as `siteSettings.collection.ts` does for the settings.
 */
export const towerScreen = defineType({
  name: 'towerScreen',
  title: 'Pantalla del edificio Vértigo',
  icon: PresentationIcon,
  type: 'document',
  description:
    'Lo que se ve en la pantalla LED de la torre, en la ciudad. Cada diapositiva rellena una plantilla fija: la web coloca cada texto en su sitio.',
  fields: [
    defineField({
      name: 'slides',
      title: 'Diapositivas',
      type: 'array',
      of: [towerSlide],
      description:
        'En el orden en que se muestran, una tras otra. Arrastra para reordenar. Al menos una; como máximo ' + BOUNDS.slides + '.',
      validation: (rule) => [
        rule.min(1).error('Añade al menos una diapositiva: sin ninguna la pantalla queda apagada.'),
        rule.max(BOUNDS.slides).error('Como máximo ' + BOUNDS.slides + ' diapositivas.'),
        rule.custom(singleSlideAdvice).warning(),
      ],
    }),
    defineField({
      name: 'rotationSeconds',
      title: 'Segundos por diapositiva',
      type: 'number',
      initialValue: 5,
      description:
        'Cuánto se mantiene cada diapositiva antes de fundirse con la siguiente. Entre ' +
        BOUNDS.rotationSecondsMin + ' y ' + BOUNDS.rotationSecondsMax + '.',
      validation: (rule) => [
        rule.required().error('Indica los segundos por diapositiva.'),
        rule.integer().error('Segundos enteros.'),
        rule
          .min(BOUNDS.rotationSecondsMin)
          .max(BOUNDS.rotationSecondsMax)
          .error(
            'Entre ' + BOUNDS.rotationSecondsMin + ' y ' + BOUNDS.rotationSecondsMax +
              ' segundos: por debajo la diapositiva no llega a leerse; por encima el visitante no ve la siguiente.',
          ),
        rule.custom(rotationAdvice).warning(),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Pantalla del edificio Vértigo' }),
  },
})
