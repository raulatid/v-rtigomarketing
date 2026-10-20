# Rangos del formulario de auditoría

**Estado:** vigente · **Desde:** 2026-09-14 (`190c589`, facturación) y 2026-09-18 (`588c8ba`, presupuesto), a petición del cliente · **Sustituye a:** DECISIONS §50 y §54

## Decisión

1. **«Rango de facturación» y «Presupuesto mensual» son desplegables cuyas opciones son contenido:** `siteSettings.revenueRanges` y `siteSettings.budgetRanges` en Sanity, emitidos como `REVENUE_RANGES` y `BUDGET_RANGES` por `src/content/site.ts`.
2. **La etiqueta es el valor.** Cada opción es una cadena que se muestra y se envía tal cual. Nadie la interpreta; el correo la muestra como se eligió.
3. **El servidor exige el conjunto cerrado**, como con `PLANS`: `server/validate.ts` importa las mismas listas generadas y rechaza cualquier otra cadena (`readRange`).
4. **Los dos campos comparten mapeo, invariantes y regla del servidor** (`rangeList` en `content/collections/siteSettings.collection.ts`, `readRange` en `server/validate.ts`), para que no puedan divergir. Una lista presente no puede tener entradas vacías ni repetidas.
5. **Siempre hay opciones:** `REVENUE_RANGES_FALLBACK` y `BUDGET_RANGES_FALLBACK` (en `siteSettings.collection.ts`) se aplican si el campo falta o está vacío. Son marcadores: las mismas opciones están sembradas en el dataset para que el editor las vea como algo que sustituir. Sin ellas, un campo obligatorio con lista vacía sería un formulario que nadie puede enviar.
6. **Límites:** longitud por entrada y número de entradas en `EDITORIAL_BOUNDS.siteSettings` (`revenueRange`, `revenueRanges`, `budgetRange`, `budgetRanges`, en `src/content/editorialBounds.ts`), igualados a mano por `CAPS.revenue` y `CAPS.budget` en `server/validate.ts`.

## Por qué

El cliente quiere tramos que todavía no conoce, y quiere editarlos él mismo. Con texto libre llegaban respuestas que no se podían comparar.

## Qué se descartó

- Texto libre en cualquiera de los dos campos (el estado anterior de cada uno).
- Un id separado de la etiqueta: obligaría al editor a mantener dos listas alineadas a mano.

## Qué se acepta

Una pestaña abierta durante un cambio de tramos envía el texto antiguo y recibe un error de campo. Es el mismo coste que en el selector de servicio.

## Se ha roto si…

- `CAPS.revenue`/`CAPS.budget` y `EDITORIAL_BOUNDS` divergen. Hoy solo lo dice un comentario (ver [trampas](../../trampas/formularios-y-privacidad.md)).
- Un dataset sin los campos deja el desplegable vacío en lugar de usar el fallback.
- `server/validate.test.ts` acepta una cadena fuera de la lista.

## Afecta a

`src/content/site.ts`, `content/collections/siteSettings.collection.ts`, `src/content/editorialBounds.ts`, `sanity-studio/schemas/siteSettings.ts`, `server/validate.ts`, `src/components/AuditSection.tsx`
