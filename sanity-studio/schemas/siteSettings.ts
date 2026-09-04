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
    {
      name: 'formularios',
      title: 'Mensajes de los formularios',
      description:
        'Lo que lee la persona cuando su mensaje se ha enviado de verdad. Aparece dentro del ' +
        'mismo panel, en el lugar del formulario. Un cambio aquí se ve en la web después de ' +
        'volver a publicar el sitio, no al instante.',
    },
  ],
  fields: [
    defineField({
      name: 'phones',
      title: 'Teléfonos',
      description:
        'Uno o varios. Cada uno lleva el número escrito de dos maneras — cómo se lee y cómo ' +
        'se marca — y, si quieres, una etiqueta delante.',
      type: 'array',
      fieldset: 'contacto',
      of: [
        defineArrayMember({
          type: 'object',
          title: 'Teléfono',
          fields: [
            defineField({
              name: 'label',
              title: 'Etiqueta',
              description:
                'Opcional. Una palabra a la izquierda del número, normalmente la ciudad. ' +
                'Ejemplo: Madrid. Escríbela SIN los dos puntos: los pone la web, para que ' +
                'estén siempre igual en todos.',
              type: 'string',
              validation: (rule) => rule.max(24).error('Demasiado largo: como máximo 24 caracteres.'),
            }),
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
          // Shown the way the site shows it, colon included, so the list in the
          // Studio reads like the finished block rather than like a form.
          preview: {
            select: { label: 'label', display: 'display', tel: 'tel' },
            prepare: ({ label, display, tel }: { label?: string; display?: string; tel?: string }) => ({
              title: label ? label + ': ' + (display ?? '') : (display ?? ''),
              subtitle: tel,
            }),
          },
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

    // ── Los mensajes de "enviado" ──
    //
    // Están aquí, y no en el código, porque prometen algo sobre la semana de
    // trabajo del cliente ("menos de 24 horas") y eso lo tiene que poder
    // cambiar quien responde los mensajes, sin esperar a un despliegue.
    //
    // Cuatro campos planos en vez de un objeto: la consulta que los lee y el
    // validador que los comprueba son planos, y anidarlos no aporta nada.
    defineField({
      name: 'auditSuccessTitle',
      title: 'Auditoría — título',
      description: 'El titular del panel cuando la solicitud ya se ha enviado. Ejemplo: Solicitud recibida',
      type: 'string',
      fieldset: 'formularios',
      validation: (rule) => [
        rule.required().error('Escribe el titular que verá quien envíe el formulario.'),
        rule.max(60).error('Demasiado largo: como máximo 60 caracteres.'),
      ],
    }),
    defineField({
      name: 'auditSuccessBody',
      title: 'Auditoría — texto',
      description:
        'Las dos líneas debajo del titular. Ejemplo: Gracias por contactarnos. Revisaremos tu ' +
        'web de forma manual y te responderemos en menos de 24 horas.',
      type: 'string',
      fieldset: 'formularios',
      validation: (rule) => [
        rule.required().error('Escribe el texto que verá quien envíe el formulario.'),
        rule.max(240).error('Demasiado largo: como máximo 240 caracteres.'),
      ],
    }),
    defineField({
      name: 'contactSuccessTitle',
      title: 'Contacto — título',
      description: 'El titular del panel cuando el mensaje ya se ha enviado. Ejemplo: Recibido',
      type: 'string',
      fieldset: 'formularios',
      validation: (rule) => [
        rule.required().error('Escribe el titular que verá quien te escriba.'),
        rule.max(60).error('Demasiado largo: como máximo 60 caracteres.'),
      ],
    }),
    defineField({
      name: 'contactSuccessBody',
      title: 'Contacto — texto',
      description:
        'Las dos líneas debajo del titular. Ejemplo: Gracias por contactarnos, te responderemos ' +
        'en menos de 24 horas.',
      type: 'string',
      fieldset: 'formularios',
      validation: (rule) => [
        rule.required().error('Escribe el texto que verá quien te escriba.'),
        rule.max(240).error('Demasiado largo: como máximo 240 caracteres.'),
      ],
    }),
  ],
  preview: {
    select: { subtitle: 'contactEmail' },
    prepare: (selection) => ({ title: 'Ajustes del sitio', subtitle: selection.subtitle }),
  },
})
