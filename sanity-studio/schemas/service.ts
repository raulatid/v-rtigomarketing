import { defineField, defineType } from 'sanity'

/**
 * One thing the agency does.
 *
 * A document rather than a row inside a district, so it is edited once and can
 * appear in more than one district. A district REFERENCES these; a reference
 * that will not resolve — deleted, or never published — fails the build naming
 * the district and the position, rather than leaving a section missing from a
 * panel where it would read as an editorial choice.
 */
export const service = defineType({
  name: 'service',
  title: 'Servicio',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Identificador',
      type: 'slug',
      description:
        'Se convierte en el aria-controls del acordeón. Solo minúsculas, números y guiones: un espacio rompe el panel para lectores de pantalla y para nadie más.',
      options: { source: 'title', maxLength: 64 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'body',
      title: 'Descripción',
      description: 'Uno o dos párrafos. Se muestra al abrir la sección.',
      type: 'text',
      rows: 6,
      validation: (rule) => rule.required().max(900),
    }),
  ],
  preview: { select: { title: 'title', subtitle: 'slug.current' } },
})
