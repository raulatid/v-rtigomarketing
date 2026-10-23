# Las herramientas de depuración no llegan al bundle de producción

**Estado:** vigente · **Desde:** 2026-08-07 (`fc986d9`, literal de compilación); `stats.js` dinámico y comprobado desde el 2026-09-05 (`e2ee116`); overlay de autoría desde el 2026-09-25 (`eb0a6fa`); herramientas de Murcia detrás del literal desde el 2026-10-23 · **Sustituye a:** DECISIONS §16, párrafo «It is a compile-time literal»

## Decisión

1. **`__VERTIGO_ENV__` es un literal que inyecta `define` en `vite.config.ts`.** Así `DEBUG_TOOLS_ENABLED` (`src/platform/buildFlags.ts`) se pliega a una constante y el minificador elimina de producción las ramas de depuración, incluido el panel `/debug`. Qué entorno es producción lo decide [producción y preview](produccion-y-preview.md).
   - Cada condición tiene que leer `DEBUG_TOOLS_ENABLED`, no solo un booleano guardado en un campo o pasado al constructor: eso no se pliega, y la rama llega a producción aunque nunca se ejecute. Por eso `MurciaExperience` solo construye `MurciaDebugTools`, `DebugOverlay` e `InteractionProbe`, y solo expone sus costuras de test (`__vertigoCamera`, `__vertigoCampus`, `__vertigoAbout`, `__vertigoBlogDisplayPoint`), detrás del literal (2026-10-23).
2. **`DEBUG_TOOLS_ENABLED` se escribe como una sola expresión en línea**, sin pasar por una función: esbuild no propaga una constante a través de una llamada.
3. **Lo que el minificador no puede eliminar se carga con import dinámico detrás de `DEBUG_TOOLS_ENABLED`:** el medidor de FPS (`stats.js`, desde `MurciaDebugTools`) y el overlay de autoría del punto de vista (`observer/observerDebug.ts`, desde `MurciaExperience`).
4. **El build comprueba las dos mitades:** en producción no puede haber chunk de stats ni del overlay; fuera de producción tiene que haber exactamente uno de cada.
5. **Fuera de producción esos chunks existen, pero no se precargan en `/`** (ver [precarga de la portada](precarga-de-la-portada.md)).

## Por qué

- Las herramientas son cómo se ajusta el proyecto, y una preview es justo donde hacen falta: en hardware real, sin indexar.
- `stats.js` es un UMD cuyo nivel superior tiene efectos secundarios: Rollup no puede eliminarlo de un chunk que lo importa. Mientras hubo un import de valor, llegó a todos los visitantes de producción detrás de un booleano falso.
- El chunk del overlay lleva las anclas de autoría, que bastan para resolver el punto de vista: no debe publicarse.
- La mitad «presente fuera de producción» es la que mantiene honesta a la otra: si el import dinámico se volviera estático, el chunk desaparecería y la exclusión de la precarga no excluiría nada.
- Con la función auxiliar que había antes, el bundle de producción llevaba la función y todas las ramas que protegía (SEC-11, comentario de `buildFlags.ts`).

## Qué se descartó

- Borrar las herramientas.
- Leer el entorno con una función auxiliar.
- Importar `stats.js` como valor.

## Se ha roto si…

- `vite build` de producción falla con «stats.js is in the production bundle» o «the vantage authoring overlay is in the production bundle».
- `vite build` fuera de producción falla con «expected exactly one stats.js chunk outside production» o «expected exactly one chunk faced by src/experiences/murcia/observer/observerDebug.ts outside production».
- Falla `e2e/production-hygiene.spec.ts` («production has no development output at …», incluida `/debug?stats=1&debugNavigation=1`). Solo corre contra un build con `VERCEL_ENV=production`.
- Que el minificador elimine una rama concreta: sin test (solo stats y el overlay tienen aserción).

## Afecta a

`vite.config.ts` (`define`, `STATS_MODULE`, `isStatsChunk`, `OBSERVER_DEBUG_MODULE`, `isObserverDebugChunk`, `assertChunkBudgets`), `src/platform/buildFlags.ts`, `src/App.tsx`, `src/experiences/murcia/debug/MurciaDebugTools.ts`, `src/experiences/murcia/debug/DebugOverlay.ts`, `src/experiences/murcia/interaction/InteractionProbe.ts`, `src/experiences/murcia/MurciaExperience.ts`, `src/experiences/murcia/observer/observerDebug.ts`, `e2e/production-hygiene.spec.ts`
