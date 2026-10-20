# Los campos son líneas, y solo un valor erróneo es rojo

**Estado:** vigente · **Desde:** 2026-10-14 (`411de44`, plan 026, sobre una maqueta aprobada para la candidatura a Awwwards) · **Sustituye a:** DECISIONS §56; en §37, «Fields are not glass» en lo que dice de su aspecto

## Decisión

1. **Los campos de contacto, auditoría y reclamo son una línea fina en reposo** (`--field-line`, `--field-line-hover`). Con foco, una línea azul se dibuja encima desde la izquierda y aparece un trazo delante de la etiqueta (`--field-line-active`).
2. **Siguen sin ser vidrio:** ningún campo lleva `backdrop-filter`. Las superficies mate (`--surface-matte`) quedan para lo que no es campo: el código del reclamo y las filas y botones de las preferencias de cookies.
3. **Un campo que se deja con un valor correcto dibuja una marca** (`data-valid`), calculada en React porque los formularios son `noValidate`.
4. **El rojo exige algo erróneo:** un campo visitado y vacío no es un error hasta pulsar «Enviar»; un valor presente y erróneo muestra su error al salir; los errores del servidor se muestran siempre.
5. **El CTA:** el hover es un barrido del azul claro, solo con `(hover: hover)`. Mientras envía, una línea de progreso recorre su pie.
6. **El desplegable de vidrio es progresivo:** `appearance: base-select` dentro de `@supports` (`auditSection.css`). Donde Chromium lo permite, la lista es el vidrio del panel, pintada en la capa superior; en el resto, la lista del sistema. Mientras está abierta, el select lleva él mismo el aspecto activo, porque `:focus-within` deja de coincidir.
7. **El texto de un campo nunca baja de 16 px:** por debajo, iOS Safari amplía la página al enfocar y la escena no se puede volver a pellizcar.

## Por qué

La maqueta aprobada para la candidatura. El rojo con el campo vacío castigaba a quien solo recorría el formulario. Un listbox en JavaScript cambiaría la accesibilidad del control nativo por un aspecto que solo existe en escritorio.

## Qué se descartó

- Las cajas mate con borde y halo de §37.
- Un listbox en JavaScript.
- Marcar en rojo los campos vacíos al salir de ellos.

## Se ha roto si…

- Fallan «when a field says it is wrong» (`src/components/ContactSection.test.tsx`) o «when an audit field says it is wrong» (`src/components/AuditSection.test.tsx`).
- La línea de reposo deja de leerse sobre un fotograma claro de la escena (se sube `--field-line`, no se quita).
- Una regla de error o de foco pierde frente a un hover o frente al anillo `.blog-surface :focus-visible` del blog.
- Se escribe `::picker(select)` en una lista de selectores fuera de `@supports`: los navegadores sin soporte descartan la regla entera.
- El texto de un campo baja de 16 px. Solo lo fija `e2e/mobile.spec.ts` para la búsqueda del blog; en los formularios, sin test.

El diálogo de reclamo se va a retirar (ver [trampas de formularios](../../trampas/formularios-y-privacidad.md), n.º 21); el comportamiento de los formularios está en [diálogo de contacto](../formularios/dialogo-de-contacto.md).

## Afecta a

`src/components/siteHeader.css` (`--field-*`), `src/components/contactSection.css`, `src/components/auditSection.css`, `src/components/ContactSection.tsx`, `src/components/AuditSection.tsx`, `src/components/ClaimDialog.tsx`, `src/components/claimDialog.css`
