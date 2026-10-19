# Edificios interactivos: parpadeo y geotags

**Estado:** vigente · **Desde:** 2026-09-24, por indicación del cliente · **Sustituye a:** DECISIONS §44 (enmiendas del 2026-09-22 y 2026-09-24)

## Decisión

1. **Los edificios que se pueden tocar parpadean solos**: un rato apagados, luego encendidos con la misma luz y color que el hover, con un borde suave. El campus de servicios y el conjunto del blog por igual. Un hover siempre puede más que el parpadeo.
2. **No hay luz nueva ni bloom**: es el mismo término de `outgoingLight` que usa el hover.
3. **Durante el encendido aparece un pin (geotag) sobre cada lugar.** El pin lee el pulso de su edificio (`highlightPulse`), así que no puede desincronizarse del parpadeo. Tiene tamaño fijo en el mundo, prueba de profundidad, no es interactivo, se oculta de cerca y cuando la brújula está oculta.
4. **Con `prefers-reduced-motion` no hay parpadeo**, y los pines se quedan visibles y quietos.
5. **Es extraíble:** la carpeta `geotags/`, su conexión en `MurciaExperience` y, opcionalmente, tres getters de solo lectura.

Valores: `BUILDING_BLINK` y `BUILDING_HIGHLIGHT` en `src/experiences/murcia/interaction/buildingHighlight.ts`; `GEOTAG` en `src/experiences/murcia/geotags/geotagConfig.ts`. El color se repite a mano en ambos porque un shader no puede leer una variable CSS: si cambia `--accent`, cambia también aquí.

## Por qué

Los visitantes no sabían qué edificios se podían tocar. La respuesta se da donde están los edificios, no en un elemento de interfaz aparte.

## Se ha roto si…

Fallan los tests de `buildingHighlight` o de `src/experiences/murcia/geotags/` (`cityGeotags.test.ts`, `createGeotags.test.ts`).

## Afecta a

`src/experiences/murcia/interaction/buildingHighlight.ts`, `src/experiences/murcia/geotags/`, `src/experiences/murcia/MurciaExperience.ts`
