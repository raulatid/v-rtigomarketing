# Diálogo de contacto, teléfonos y ©

**Estado:** vigente · **Desde:** 2026-08-20; revisado el 2026-08-24 y el 2026-09-03; enlace de reserva desde el 2026-09-05 (`4874719`); formulario cargado por intención desde el 2026-11-24 · **Sustituye a:** DECISIONS §30 en lo que dice del pie, los teléfonos, el botón de Contacto y el ©

## Decisión

1. **El pie lleva solo el ©** (`CopyrightMark.tsx`). Cada dato va donde surge la pregunta que responde:
   - los teléfonos, como enlaces `tel:` sin envoltorio, al pie del diálogo de contacto, bajo una línea fina, como alternativa una vez que el formulario ya ha hecho su petición;
   - los enlaces «Términos y privacidad» y «Aviso legal», al pie del formulario de auditoría, y solo en la rama del formulario: la pantalla de éxito es un recibo.
2. **Contacto es texto sin caja** junto al botón azul de Auditoría. El azul es solo del CTA principal.
3. **El diálogo ofrece tres caminos:** escribir, reservar y llamar. El enlace de reserva (`BOOKING_URL`, `BOOKING_LABEL` en `src/content/site.ts`) es contenido opcional: si está vacío, no se muestra el botón. El build comprueba la forma del enlace (`isBookingUrl`), no su dominio, para que el cliente pueda cambiar de plataforma sin desplegar código.
4. **Los teléfonos, la reserva, el © y los mensajes de confirmación son contenido de Sanity**, leídos a través de `src/content/site.ts` (`SITE_PHONES`, `BOOKING_URL`, `BOOKING_LABEL`, `FORM_MESSAGES`, `COPYRIGHT`). Cómo llegan ahí lo decide el área de contenido.
5. **El © propio no es un crédito.** La prohibición de créditos de terceros se vigila solo sobre sus formas (ESO, CC BY, Creative Commons), no sobre cualquier ©.
6. **El formulario se carga por intención** (desde el 2026-11-24). `ContactSection.tsx` lleva el botón, si el diálogo está abierto y la vuelta del foco al botón. El formulario, su estado y el envío están en `ContactDialog.tsx`, un chunk que `/` no precarga ([precarga de la portada](../build/precarga-de-la-portada.md)). El botón lo pide al pasar el puntero o el foco (`preloadContactDialog`, `LazyContactDialog.tsx`), así que suele estar al hacer clic. Si el clic llega antes, el diálogo se abre cuando llega el chunk y el foco entra entonces. Se monta en la primera apertura y ya no se desmonta: lo escrito sigue ahí tras cerrar con un error, y un envío correcto lo vacía al cerrar, como antes.

## Por qué

El formulario fuera de `/` (2026-11-24): el JS inicial de `/` no sube de su línea y no cabía la integración de la noche del 2026-11-24 con el isotipo en 3D de Conócenos. Contacto no hace falta para el primer fotograma, y es el diálogo sin máquina de fases; la cortina de la auditoría sí la tiene, y diferirla cambiaba sus tiempos de apertura. Libera unos 8 KB (el chunk de `ContactDialog`).


El cliente quiso cada dato donde surge su pregunta (2026-08-24), aunque eso deja los teléfonos a un clic. Es una inversión deliberada del razonamiento inicial («un número tras un desplegable cuesta llamadas»).

## Qué se descartó

- Teléfonos y enlaces legales en la línea del pie (diseño del 2026-08-20).
- Contacto como botón fantasma con borde.
- Datos de marca escritos a mano en `site.ts`.

## Se ha roto si…

- Los teléfonos o los enlaces legales vuelven a la línea del pie.
- Un crédito de terceros pasa la aserción de `e2e/backdrop.spec.ts`, o el © propio la hace fallar.
- El botón de reserva aparece con `BOOKING_URL` vacío.
- `/` precarga `ContactDialog`, o lo escrito se pierde al cerrar con un error. Fijan: `vite build` («expected exactly one chunk for src/components/ContactDialog.tsx») y «the form loaded on intent» y `LazyContactDialog.test.tsx`.

## Afecta a

`src/components/ContactSection.tsx`, `src/components/ContactDialog.tsx`, `src/components/LazyContactDialog.tsx`, `vite.config.ts` (`isContactDialogChunk`), `src/components/CopyrightMark.tsx`, `src/components/AuditSection.tsx`, `src/content/site.ts`, `content/collections/siteSettings.collection.ts`, `e2e/backdrop.spec.ts`
