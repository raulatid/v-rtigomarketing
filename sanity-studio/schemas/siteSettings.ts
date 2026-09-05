import { CogIcon } from '@sanity/icons/Cog'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { bannerImageErrors } from './lib/bannerImage'

/**
 * The lengths this schema refuses, shared with the content build.
 *
 * They used to be literals here and literals again in
 * `content/collections/*.collection.ts`, which is the arrangement where one
 * gets relaxed and the other quietly does not — and the editor finds out by
 * having a document accepted here and rejected by the next deployment. The
 * numbers live in one table now; see `src/content/editorialBounds.ts`,
 * including why that module has no imports and must not gain any.
 *
 * The messages interpolate rather than restate. A message that says "como
 * máximo 140" beside a rule that allows 200 is worse than no message.
 */
const BOUNDS = EDITORIAL_BOUNDS.siteSettings

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
    {
      name: 'edificio',
      title: 'Edificio Vértigo',
      description:
        'La pantalla que gira en lo alto del edificio Vértigo, en la ciudad. Un cambio aquí se ' +
        've en la web después de volver a publicar el sitio.',
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
              validation: (rule) =>
                rule.max(BOUNDS.label).error(
                  `Demasiado largo: como máximo ${BOUNDS.label} caracteres.`,
                ),
            }),
            defineField({
              name: 'display',
              title: 'Cómo se lee',
              description: 'Con espacios, como lo escribirías en una tarjeta. Ejemplo: +34 968 12 34 56',
              type: 'string',
              validation: (rule) => [
                rule.required().error('Escribe el número como debe leerse.'),
                rule.max(BOUNDS.display).error('Demasiado largo.'),
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
        rule.max(BOUNDS.phones).error(`Como máximo ${BOUNDS.phones} teléfonos.`),
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
    // ── El enlace para reservar cita ──
    //
    // Opcional de verdad: mientras esté vacío, la web NO enseña el botón. No
    // hay ningún valor por defecto que tenga sentido — es tu agenda — así que
    // "vacío" significa "todavía no", no "algo va mal".
    //
    // Sirve CUALQUIER plataforma de reservas, no sólo Calendly: si algún día
    // cambiáis de herramienta, basta con pegar aquí el enlace nuevo. Lo único
    // que se comprueba es que sea una dirección https:// completa y que lleve a
    // tu página concreta y no a la portada del servicio — un botón que promete
    // una cita y aterriza en una página de inicio es peor que no tener botón.
    defineField({
      name: 'bookingUrl',
      title: 'Enlace para reservar cita',
      description:
        'Opcional. La dirección pública de tu página de reservas, copiada tal cual de la barra ' +
        'del navegador. Sirve cualquier plataforma. Ejemplo: ' +
        'https://tuplataforma.com/vertigo/30min — Mientras esté vacío, el botón no aparece en ' +
        'el formulario de contacto.',
      type: 'url',
      fieldset: 'contacto',
      validation: (rule) => [
        rule.uri({ scheme: ['https'] }).error('Tiene que empezar por https://'),
        rule
          .custom((value?: string) => {
            if (value === undefined || value === null || value === '') return true
            let url: URL
            try {
              url = new URL(value)
            } catch {
              return 'Escribe la dirección completa, empezando por https://'
            }
            // Analizamos la dirección en vez de leerla como texto: así un
            // enlace que sólo CONTIENE "https://" no cuela.
            if (url.protocol !== 'https:') return 'Tiene que empezar por https://'
            // Un enlace con usuario delante de la @ ("https://calendly.com@otro-sitio.com")
            // parece de una web y lleva a otra. No existe en un enlace de reservas real.
            if (url.username !== '' || url.password !== '') {
              return 'Quita lo que va delante de la @: el enlace no lleva a donde parece'
            }
            if (url.pathname.length <= 1) {
              return 'Falta tu página: pega el enlace completo, no sólo el dominio'
            }
            return true
          })
          .error(),
      ],
    }),
    // El texto del botón. NO es `required()`, a diferencia de los mensajes de
    // los formularios: marcarlo obligatorio pondría en rojo el único documento
    // de ajustes por un botón que quizá ni se enseña. Vacío = "Agenda una cita".
    defineField({
      name: 'bookingLabel',
      title: 'Texto del botón de reservar',
      description:
        'Opcional. Lo que dice el botón. Si lo dejas vacío pone "Agenda una cita". La web lo ' +
        'escribe en mayúsculas sola, así que escríbelo normal. Como máximo 24 caracteres: más ' +
        'largo y no cabe en una línea en el móvil.',
      type: 'string',
      fieldset: 'contacto',
      validation: (rule) => rule.max(24).error('Demasiado largo: como máximo 24 caracteres.'),
    }),
    defineField({
      name: 'copyright',
      title: 'Línea de copyright',
      description: 'El texto que cierra la página. Ejemplo: © 2026 Vertigo',
      type: 'string',
      fieldset: 'pie',
      validation: (rule) => [
        rule.required().error('Escribe la línea de copyright.'),
        rule.max(BOUNDS.copyright).error(`Demasiado largo: como máximo ${BOUNDS.copyright} caracteres.`),
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
        rule.max(BOUNDS.successTitle).error(
          `Demasiado largo: como máximo ${BOUNDS.successTitle} caracteres.`,
        ),
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
        rule.max(BOUNDS.successBody).error(
          `Demasiado largo: como máximo ${BOUNDS.successBody} caracteres.`,
        ),
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
        rule.max(BOUNDS.successTitle).error(
          `Demasiado largo: como máximo ${BOUNDS.successTitle} caracteres.`,
        ),
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
        rule.max(BOUNDS.successBody).error(
          `Demasiado largo: como máximo ${BOUNDS.successBody} caracteres.`,
        ),
      ],
    }),
    // ── La pantalla del edificio ──
    //
    // Sólo imagen, de momento. El vídeo está previsto y documentado en el
    // código, pero no se ofrece aquí hasta que exista: un campo sin nada que lo
    // lea es una promesa que el Studio hace en nombre de la web.
    defineField({
      name: 'bannerEnabled',
      title: 'Mostrar la pantalla',
      description:
        'Apagado, la pantalla se ve como el resto del edificio. Encendido sin imagen, la web ' +
        'enseña su propia imagen provisional.',
      type: 'boolean',
      fieldset: 'edificio',
      initialValue: true,
    }),
    defineField({
      name: 'bannerImage',
      title: 'Imagen de la pantalla',
      description:
        'Apaisada, casi el doble de ancha que de alta: 1600×800 es el tamaño ideal. PNG o ' +
        'WebP. Se repite en las cuatro caras de la pantalla.',
      type: 'image',
      fieldset: 'edificio',
      options: { accept: 'image/png,image/webp' },
      validation: (rule) => rule.custom(bannerImageErrors()),
    }),
  ],
  preview: {
    select: { subtitle: 'contactEmail' },
    prepare: (selection) => ({ title: 'Ajustes del sitio', subtitle: selection.subtitle }),
  },
})
