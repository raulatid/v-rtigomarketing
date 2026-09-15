import { CogIcon } from '@sanity/icons/Cog'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { charCount } from '../components/CharCountInput'
import { phoneSpellingsAgree } from './lib/phone'

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
 * The booking button's words. Bounded here and in `siteSettings.collection.ts`,
 * not yet in the shared table; named so the rule and the counter share it.
 */
const BOOKING_LABEL_MAX = 24

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
 *
 * ── Where these show, because the descriptions say it in visitor terms ──
 * Phones and the booking button: the Contacto dialog (`ContactSection.tsx`).
 * `contactEmail`: nowhere — it is where both forms' messages are delivered.
 * `copyright`: the Earth scene's footer only; the blog hardcodes its own.
 * The four success strings: in place of each form after a real send.
 * `revenueRanges`: the options of the Auditoría panel's billing dropdown.
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
      description:
        'Lo que se ve en la ventana «Contacto», la que se abre con el botón Contacto de la ' +
        'cabecera de la web.',
    },
    {
      name: 'formularios',
      title: 'Mensajes de «enviado»',
      description:
        'La web tiene dos formularios. «Auditoría» es el panel lateral que se abre con el botón ' +
        'Auditoría de la cabecera; «Contacto» es la ventana del botón Contacto. Cuando alguien ' +
        'envía uno, el formulario desaparece y en su lugar se lee este titular y este texto.',
    },
    {
      name: 'auditoria',
      title: 'Formulario de auditoría',
      description:
        'Las opciones del panel «Auditoría», el que se abre con el botón Auditoría de la cabecera.',
    },
    { name: 'pie', title: 'Pie de página' },
    // Every field in here is hidden (see bannerEnabled), and Sanity does not draw
    // a fieldset with nothing visible in it. Kept so the stored values keep
    // their home until the fields are removed end-to-end.
    { name: 'edificio', title: 'Edificio Vértigo' },
  ],
  fields: [
    defineField({
      name: 'phones',
      title: 'Teléfonos',
      description:
        'Aparecen al final de la ventana «Contacto»; en el móvil, al pulsarlos se llama. Cada ' +
        'número se escribe dos veces: tal como se lee y tal como se marca.',
      type: 'array',
      fieldset: 'contacto',
      of: [
        defineArrayMember({
          type: 'object',
          title: 'Teléfono',
          fields: [
            defineField({
              name: 'label',
              title: 'Ciudad o etiqueta',
              description:
                'Opcional. La palabra delante del número, normalmente la ciudad. Escríbela sin ' +
                'los dos puntos: los pone la web, para que salgan todos iguales.',
              type: 'string',
              placeholder: 'Madrid',
              components: { input: charCount(BOUNDS.label) },
              validation: (rule) =>
                rule.max(BOUNDS.label).error(
                  `Demasiado largo: como máximo ${BOUNDS.label} caracteres.`,
                ),
            }),
            defineField({
              name: 'display',
              title: 'Número tal como se ve',
              description: 'Con espacios, como lo escribirías en una tarjeta de visita.',
              type: 'string',
              placeholder: '+34 968 12 34 56',
              components: { input: charCount(BOUNDS.display) },
              validation: (rule) => [
                rule.required().error('Escribe el número tal como debe leerse.'),
                rule.max(BOUNDS.display).error(
                  `Demasiado largo: como máximo ${BOUNDS.display} caracteres.`,
                ),
              ],
            }),
            defineField({
              name: 'tel',
              title: 'Número para llamar',
              description:
                'El mismo número, solo con dígitos y el prefijo del país delante: sin espacios ' +
                'ni guiones. Es el que marca el móvil al pulsarlo.',
              type: 'string',
              placeholder: '+34968123456',
              validation: (rule) =>
                rule
                  .required()
                  .regex(/^\+?[0-9]{6,20}$/)
                  .error('Solo dígitos, sin espacios ni guiones. Ejemplo: +34968123456'),
            }),
          ],
          validation: (rule) => rule.custom(phoneSpellingsAgree).warning(),
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
      title: 'Correo que recibe los mensajes',
      description:
        'Aquí llegan los mensajes de los dos formularios de la web, Auditoría y Contacto. No se ' +
        'muestra a los visitantes.',
      type: 'string',
      fieldset: 'contacto',
      placeholder: 'hola@vertigomarketing.es',
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
        'Opcional. La dirección de tu página de reservas, copiada tal cual de la barra del ' +
        'navegador; sirve cualquier plataforma. Con un enlace aquí, la ventana «Contacto» ' +
        'muestra un botón para reservar. Vacío, el botón no aparece.',
      type: 'url',
      fieldset: 'contacto',
      placeholder: 'https://tuplataforma.com/vertigo/30min',
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
        'Opcional. Lo que dice el botón, tal cual lo escribas. Vacío, pone «Agenda una cita». ' +
        'Más largo del máximo no cabe en una línea en el móvil.',
      type: 'string',
      fieldset: 'contacto',
      placeholder: 'Agenda una cita',
      components: { input: charCount(BOOKING_LABEL_MAX) },
      validation: (rule) =>
        rule
          .max(BOOKING_LABEL_MAX)
          .error(`Demasiado largo: como máximo ${BOOKING_LABEL_MAX} caracteres.`),
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
      title: 'Auditoría — titular',
      description: 'El titular grande, en el sitio donde estaba el formulario.',
      type: 'string',
      fieldset: 'formularios',
      placeholder: 'Solicitud recibida',
      components: { input: charCount(BOUNDS.successTitle) },
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
      description: 'Una o dos frases debajo del titular.',
      type: 'string',
      fieldset: 'formularios',
      placeholder:
        'Gracias por contactarnos. Revisaremos tu web de forma manual y te responderemos en menos de 24 horas.',
      components: { input: charCount(BOUNDS.successBody) },
      validation: (rule) => [
        rule.required().error('Escribe el texto que verá quien envíe el formulario.'),
        rule.max(BOUNDS.successBody).error(
          `Demasiado largo: como máximo ${BOUNDS.successBody} caracteres.`,
        ),
      ],
    }),
    defineField({
      name: 'contactSuccessTitle',
      title: 'Contacto — titular',
      description: 'El titular grande, en el sitio donde estaba el formulario.',
      type: 'string',
      fieldset: 'formularios',
      placeholder: 'Recibido',
      components: { input: charCount(BOUNDS.successTitle) },
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
      description: 'Una o dos frases debajo del titular.',
      type: 'string',
      fieldset: 'formularios',
      placeholder: 'Gracias por contactarnos, te responderemos en menos de 24 horas.',
      components: { input: charCount(BOUNDS.successBody) },
      validation: (rule) => [
        rule.required().error('Escribe el texto que verá quien te escriba.'),
        rule.max(BOUNDS.successBody).error(
          `Demasiado largo: como máximo ${BOUNDS.successBody} caracteres.`,
        ),
      ],
    }),

    // ── Los rangos de facturación ──
    //
    // Cada línea es una opción del desplegable, en este orden. Lo que escribas
    // es exactamente lo que ve el visitante y lo que llega en el correo: no hay
    // un "valor interno" aparte. Obligatorio: sin rangos no habría nada que
    // elegir y el formulario no se podría enviar.
    defineField({
      name: 'revenueRanges',
      title: 'Rangos de facturación',
      description:
        'Las opciones del desplegable «Rango de facturación de tu empresa» del panel Auditoría, ' +
        'en este mismo orden (arrastra para reordenar). Lo que escribas es lo que ve el visitante ' +
        'y lo que te llega en el correo.',
      type: 'array',
      fieldset: 'auditoria',
      of: [
        defineArrayMember({
          type: 'string',
          title: 'Rango',
          components: { input: charCount(BOUNDS.revenueRange) },
          validation: (rule) => [
            rule.required().error('Escribe el rango o quita la línea.'),
            rule.max(BOUNDS.revenueRange).error(
              `Demasiado largo: como máximo ${BOUNDS.revenueRange} caracteres.`,
            ),
          ],
        }),
      ],
      validation: (rule) => [
        rule.required().min(1).error('Añade al menos un rango.'),
        rule.max(BOUNDS.revenueRanges).error(`Como máximo ${BOUNDS.revenueRanges} rangos.`),
        rule.unique().error('Hay dos rangos iguales: el visitante no podría distinguirlos.'),
      ],
    }),
    defineField({
      name: 'copyright',
      title: 'Línea de copyright',
      description: 'El texto pequeño al pie de la pantalla del planeta, la portada de la web.',
      type: 'string',
      fieldset: 'pie',
      placeholder: '© 2026 Vertigo',
      components: { input: charCount(BOUNDS.copyright) },
      validation: (rule) => [
        rule.required().error('Escribe la línea de copyright.'),
        rule.max(BOUNDS.copyright).error(`Demasiado largo: como máximo ${BOUNDS.copyright} caracteres.`),
      ],
    }),
    // Retired banner fields remain hidden to preserve existing CMS values.
    // The build no longer projects, mirrors or validates them. No migration
    // or asset deletion is performed; new documents need no banner defaults.
    defineField({
      name: 'bannerEnabled',
      title: 'Mostrar la pantalla',
      type: 'boolean',
      fieldset: 'edificio',
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: 'bannerImage',
      title: 'Imagen de la pantalla',
      type: 'image',
      fieldset: 'edificio',
      hidden: true,
      readOnly: true,
    }),
  ],
  preview: {
    select: { subtitle: 'contactEmail' },
    prepare: (selection) => ({ title: 'Ajustes del sitio', subtitle: selection.subtitle }),
  },
})
