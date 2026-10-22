import { UsersIcon } from '@sanity/icons/Users'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { charCount } from '../components/CharCountInput'
import { markupAdvice, singleParagraphAdvice } from './lib/advice'
import { plainText } from './lib/plainText'
import { towerSlide } from './towerScreen'

/**
 * The lengths this schema refuses, shared with the content build. See
 * `src/content/editorialBounds.ts` (`aboutSection`, and `towerScreen` for the
 * slide, which is the screen's own template).
 */
const BOUNDS = EDITORIAL_BOUNDS.aboutSection

/** A stop's title and its one or two paragraphs. */
function stopFields() {
  return [
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      description: 'Como máximo ' + BOUNDS.title + ' caracteres.',
      components: { input: charCount(BOUNDS.title) },
      validation: (rule) => [
        rule.required().error('Escribe el título de esta parada.'),
        rule.max(BOUNDS.title).error('Como máximo ' + BOUNDS.title + ' caracteres.'),
        rule.custom(plainText),
        rule.custom(markupAdvice).warning(),
        rule.custom(singleParagraphAdvice).warning(),
        rule.max(BOUNDS.titleAdvised).warning('Un título más corto se lee de un vistazo.'),
      ],
    }),
    defineField({
      name: 'paragraphs',
      title: 'Párrafos',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'text',
          rows: 3,
          validation: (rule) => [
            rule.required().error('Escribe el párrafo, o quítalo.'),
            rule.max(BOUNDS.paragraph).error('Como máximo ' + BOUNDS.paragraph + ' caracteres por párrafo.'),
            rule.custom(plainText),
            rule.custom(markupAdvice).warning(),
            rule.max(BOUNDS.paragraphAdvised).warning('Más corto se lee mejor entre dos movimientos de cámara.'),
          ],
        }),
      ],
      description: 'Uno o ' + BOUNDS.paragraphs + ' párrafos cortos. Se leen junto a la vista, entre un movimiento de cámara y el siguiente.',
      validation: (rule) => [
        rule.required().min(1).error('Escribe al menos un párrafo.'),
        rule.max(BOUNDS.paragraphs).error('Como máximo ' + BOUNDS.paragraphs + ' párrafos.'),
      ],
    }),
  ]
}

function label(name: string, title: string, description: string) {
  return defineField({
    name,
    title,
    type: 'string',
    description: description + ' Como máximo ' + BOUNDS.label + ' caracteres.',
    components: { input: charCount(BOUNDS.label) },
    validation: (rule) => [
      rule.required().error('Escribe el texto del botón.'),
      rule.max(BOUNDS.label).error('Como máximo ' + BOUNDS.label + ' caracteres: el botón va en una línea.'),
      rule.custom(plainText),
    ],
  })
}

/**
 * The Conócenos section: a visit from the base of the tower, in three stops.
 *
 * A SINGLETON, presented as one document by `sanity.config.ts`. Until it is
 * published the tower's base names itself and goes nowhere;
 * `aboutSection.collection.ts` allows that, and fails on a second document.
 */
export const aboutSection = defineType({
  name: 'aboutSection',
  title: 'Conócenos',
  icon: UsersIcon,
  type: 'document',
  description:
    'La visita que empieza al pulsar la base de la torre Vértigo: la pantalla, la azotea y el cielo. La primera parada es la diapositiva de la pantalla; las otras dos llevan un texto.',
  fields: [
    defineField({
      name: 'slide',
      title: 'Parada 1 · La pantalla',
      type: 'object',
      description:
        'La cámara se pone delante de la pantalla de la torre, que muestra esta diapositiva durante toda la visita. Es todo lo que dice la primera parada: no lleva texto al lado. La misma plantilla que la pantalla normal.',
      fields: towerSlide.fields,
      validation: (rule) => rule.required().error('Rellena la diapositiva: sin ella la pantalla se apaga durante la visita.'),
    }),
    defineField({
      name: 'rooftop',
      title: 'Parada 2 · La azotea',
      type: 'object',
      description: 'La cámara mira el logo de la torre desde arriba.',
      fields: stopFields(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sky',
      title: 'Parada 3 · El cielo',
      type: 'object',
      description: 'La cámara mira al cielo de noche, donde pasan los logos de los clientes. Lleva tres botones.',
      fields: [
        ...stopFields(),
        label('contactLabel', 'Botón de contacto', 'Abre el formulario de contacto.'),
        label('auditLabel', 'Botón de auditoría', 'Abre el formulario de auditoría.'),
        label('casesLabel', 'Botón de casos', 'Viaja a la Tierra, donde están los casos de los clientes.'),
      ],
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Conócenos' }),
  },
})
