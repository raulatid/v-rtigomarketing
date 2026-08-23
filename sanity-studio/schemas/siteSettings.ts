import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * The handful of global values an editor owns.
 *
 * A SINGLETON, presented as one document by `sanity.config.ts` — which is a
 * convenience, not a guarantee. `siteSettings.collection.ts` asserts the count
 * at build time, because a restored backup, a re-run import or the HTTP API can
 * all produce a second document this Studio never showed anybody, and
 * `src/content/site.ts` reads the first one.
 *
 * Deliberately not a key/value bag. A global value earns a field here when it is
 * genuinely editorial; anything else is configuration and belongs in code.
 */
export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Ajustes del sitio',
  type: 'document',
  fields: [
    defineField({
      name: 'phones',
      title: 'Teléfonos',
      description: 'Al menos uno. Aparecen en el pie de página.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'display',
              title: 'Cómo se lee',
              description: 'Con los espacios que hagan falta para que se lea bien.',
              type: 'string',
              validation: (rule) => rule.required().max(40),
            }),
            defineField({
              name: 'tel',
              title: 'Cómo se marca',
              description:
                'Solo dígitos, con un + inicial opcional. Un espacio aquí produce un enlace que en algunos móviles no hace nada, sin avisar.',
              type: 'string',
              validation: (rule) =>
                rule.required().regex(/^\+?[0-9]{6,20}$/, { name: 'número marcable' }),
            }),
          ],
          preview: { select: { title: 'display', subtitle: 'tel' } },
        }),
      ],
      validation: (rule) => rule.required().min(1).max(4),
    }),
    defineField({
      name: 'contactEmail',
      title: 'Email de contacto',
      type: 'string',
      validation: (rule) => rule.required().email(),
    }),
    defineField({
      name: 'copyright',
      title: 'Aviso de copyright',
      description: 'La marca propia, no una atribución de terceros.',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
  ],
  preview: { select: { subtitle: 'contactEmail' }, prepare: (s) => ({ title: 'Ajustes del sitio', subtitle: s.subtitle }) },
})
