import { CogIcon } from '@sanity/icons/Cog'
import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * The handful of global values an editor owns.
 *
 * A SINGLETON, presented as one document by `sanity.config.ts` — which is a
 * convenience, not a guarantee. `siteSettings.collection.ts` asserts the count
 * at build time, because a restored backup, a re-run import or the HTTP API can
 * all produce a second document this Studio never showed anybody.
 *
 * Deliberately not a key/value bag. A global value earns a field here when it is
 * genuinely editorial; anything else is configuration and belongs in code.
 */
export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Ajustes del sitio',
  icon: CogIcon,
  type: 'document',
  fieldsets: [
    {
      name: 'contacto',
      title: 'Contacto',
      description: 'Cómo puede la gente ponerse en contacto. Aparece en el pie de página.',
    },
    { name: 'pie', title: 'Pie de página' },
  ],
  fields: [
    defineField({
      name: 'phones',
      title: 'Teléfonos',
      description: 'Uno o varios. Cada uno tiene dos versiones: cómo se lee y cómo se marca.',
      type: 'array',
      fieldset: 'contacto',
      of: [
        defineArrayMember({
          type: 'object',
          title: 'Teléfono',
          fields: [
            defineField({
              name: 'display',
              title: 'Cómo se lee',
              description: 'Con espacios, como lo escribirías en una tarjeta. Ejemplo: +34 968 12 34 56',
              type: 'string',
              validation: (rule) => [
                rule.required().error('Escribe el número como debe leerse.'),
                rule.max(40).error('Demasiado largo.'),
              ],
            }),
            defineField({
              name: 'tel',
              title: 'Cómo se marca',
              description: 'Solo dígitos, sin espacios ni guiones. Ejemplo: +34968123456',
              type: 'string',
              validation: (rule) =>
                rule
                  .required()
                  .regex(/^\+?[0-9]{6,20}$/)
                  .error('Solo dígitos, sin espacios ni guiones. Ejemplo: +34968123456'),
            }),
          ],
          preview: { select: { title: 'display', subtitle: 'tel' } },
        }),
      ],
      validation: (rule) => [
        rule.required().min(1).error('Añade al menos un teléfono.'),
        rule.max(4).error('Como máximo 4 teléfonos.'),
      ],
    }),
    defineField({
      name: 'contactEmail',
      title: 'Correo de contacto',
      description: 'La dirección a la que llegan los mensajes. Ejemplo: hola@vertigomarketing.es',
      type: 'string',
      fieldset: 'contacto',
      validation: (rule) =>
        rule.required().email().error('Escribe una dirección de correo completa, con @ y dominio.'),
    }),
    defineField({
      name: 'copyright',
      title: 'Línea de copyright',
      description: 'El texto que cierra la página. Ejemplo: © 2026 Vertigo',
      type: 'string',
      fieldset: 'pie',
      validation: (rule) => [
        rule.required().error('Escribe la línea de copyright.'),
        rule.max(120).error('Demasiado largo: como máximo 120 caracteres.'),
      ],
    }),
  ],
  preview: {
    select: { subtitle: 'contactEmail' },
    prepare: (selection) => ({ title: 'Ajustes del sitio', subtitle: selection.subtitle }),
  },
})
