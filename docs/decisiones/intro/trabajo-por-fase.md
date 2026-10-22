# El trabajo se admite según la fase de la apertura

**Estado:** vigente · **Desde:** 2026-10-19 (`046be82`, `e38b80c`, ADR 016) · **Sustituye a:** la regla de trabajo de ADR 016 y las partes de DECISIONS §33 sobre cuándo carga la ciudad

## Decisión

1. **Cada unidad de trabajo diferido tiene un tipo:** red, worker, hilo principal o GPU. La tabla `MAIN_THREAD` de `openingMachine.ts` decide qué se admite en cada fase (`admits()`):
   - red y worker, siempre;
   - hilo principal y GPU, solo en `draw` y `site`. La GPU cuenta como hilo principal porque enlazar un programa bloquea en la consulta de estado.
2. **El trabajo diferido nunca empieza durante `draw`** (`admitsDeferred` en `workScheduler.ts`).
3. **El planificador arranca como mucho una unidad de hilo principal por fotograma.** Avanza justo después del reloj de la intro y pregunta la fase a la apertura (`getOpening()`), no a una copia.
4. **La ciudad son dos unidades:** los bytes (red, desde `shrink`) y la construcción (hilo principal, en `site`). Navegar exige `murciaReady` y `site`.
5. Los satélites siguen cargando durante `draw`, fuera del planificador. Las precargas de Earth van con `fetchpriority="low"`.

## Por qué

Tapar la pantalla no oculta el trabajo: una tarea larga durante la cola de la intro la entrecorta igual. Mover la construcción de la ciudad a `shrink` y `warp` sin una regla dejó el peor tramo medido a 39 fps.

## Qué se descartó

- Colocar la ciudad según un evento conveniente (`intro.completed`).
- Usar «menos bytes» como palanca.
- Subir las precargas de Earth a prioridad alta: se midió que retrasaba el primer fotograma dibujado.

## Pendiente (de ADR 016)

El presupuesto de trabajo por fotograma en `site`, y un plazo para los satélites con conexiones lentas.

## Se ha roto si…

Fallan `workScheduler.test.ts` («refuses everything in draw», «starts one main-thread unit per step…», «never starts a cancelled unit») u `openingMachine.test.ts` («the work rule (ADR 016)»).

## Afecta a

`src/intro-draw/openingMachine.ts`, `src/intro-draw/workScheduler.ts`, `src/components/SceneCanvas.tsx`, `src/experiences/murcia/MurciaLayer.tsx`, `index.html`
