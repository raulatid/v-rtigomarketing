# Precarga y precalentado de Murcia

**Estado:** vigente · **Desde:** 2026-10-19 (`e38b80c`, ADR 016); construcción partida en tareas desde el 2026-11-25 · **Sustituye a:** DECISIONS §5 y ADR 004 en lo que dicen de la precarga

## Decisión

1. **Los bytes de la ciudad se leen durante la apertura**, como trabajo de red que la apertura admite desde la fase `shrink` (`prefetchCityBytes`).
2. **La construcción de la ciudad (parseo, decodificación, montaje y precalentado) es trabajo del hilo principal y solo se admite en la fase `site`**, para no competir con la animación de apertura (ADR 016).
3. **Murcia nunca bloquea la disponibilidad del sitio.** Su entrada del manifiesto es `required: false`. Mientras no está lista, `murciaReady` impide navegar hacia ella.
4. **Precalentar (`warm()`) es más de una operación:**
   - compilar los programas dos veces, para el canvas y para un render target (`compileAsyncForRenderTarget`), porque el warp dibuja Murcia dentro del composer;
   - renders a un `WebGLRenderTarget` de 1×1 para subir buffers y texturas, por lotes y uno por fotograma (`WARM_BATCH`): el lote crece mientras el render sale barato y se parte cuando no;
   - revelar durante el proceso las piezas que nacen ocultas (`whileRevealed`);
   - restaurar el color y el alfa de limpieza del renderer.
5. Los pases del warp (afterimage y vacío) se precalientan igual al montar `RenderPipeline`.
6. **La construcción no encadena sus pasos en una sola tarea:** entre paso y paso cede el fotograma (`afterNextFrame`, después de dibujarlo), porque corre con la Tierra en pantalla. Las consultas de la herencia de luz (`inheritLight`) van en un worker propio (`inheritanceWorker.ts`), sin respaldo en el hilo principal: los decodificadores de la ciudad ya necesitan workers, y su código pesaría en el JS inicial.

## Por qué

Que el mundo llegue sin compilar al fotograma de la transición produce un tirón visible. Construirlo durante la apertura, en cambio, la entrecortaba; por eso la red va pronto y el trabajo de CPU espera a `site`.

Partirla (punto 6) es porque esperar a `site`, y después al aterrizaje del h1, no la quitó de la vista: sus pasos seguidos daban cuatro tareas, la mayor de 437 ms en escritorio y de unos 2,1 s con la CPU a 4×, justo cuando aparece la línea bajo el h1. Partida, la mayor baja a 55 ms y a unos 220 ms, y los fotogramas perdidos desde el aterrizaje hasta `murcia:model`, de 45 a 4 y de 226 a 66 (producción, GPU real, 2026-11-25). En móvil quedan tareas de 70–270 ms: `setupCampus`, la creación de programas de `warm()`, `computeRiverFrame` y el montaje de mallas de `inheritLight`.

## Qué se descartó

- Cargar la ciudad bajo demanda, o mostrar un estado de carga dentro de la transición.
- Construir la ciudad durante la apertura (el comportamiento anterior a `e38b80c`).

## Se ha roto si…

- `e2e/boot.spec.ts` «never paints a light frame during boot» falla (el precalentado no restauró el color de limpieza).
- Falla `whileRevealed.test.ts` o `inheritLight.test.ts`.
- Tras aterrizar el h1 vuelve a haber una tarea larga de cientos de milisegundos (no lo fija ningún test; se mide con una traza).
- La primera transición a Murcia da un tirón (no lo fija ningún test).

## Afecta a

`src/experiences/murcia/MurciaLayer.tsx`, `src/experiences/murcia/MurciaExperience.ts` (`warm`, `WARM_BATCH`, `prefetchCityBytes`), `src/experiences/murcia/core/afterNextFrame.ts`, `src/experiences/murcia/assets/loadCity.ts`, `src/experiences/murcia/assets/lightmaps/inheritLight.ts`, `src/experiences/murcia/assets/lightmaps/inheritanceSolve.ts`, `src/experiences/murcia/assets/lightmaps/inheritanceWorker.ts`, `src/graphics/compileForTarget.ts`, `src/graphics/RenderPipeline.tsx`, `src/intro-draw/workScheduler.ts`, `src/intro-draw/bootState.ts`
