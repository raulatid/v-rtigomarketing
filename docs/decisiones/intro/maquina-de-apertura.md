# La apertura es una máquina de estados con un reloj propio

**Estado:** vigente · **Desde:** 2026-10-19 (`19ca65d`, `7abc389`, ADR 016); una sola apertura por página desde 2026-10-22 · **Sustituye a:** DECISIONS §26.1, §26.2 y §26.3 (con su enmienda) y las partes de máquina y reloj de ADR 016

## Decisión

1. **Las fases se comparan por orden, nunca como lista.** `Phase` y `PHASE_ORDER` están en `src/experiences/earth/config/introConfig.ts`, y toda comparación pasa por `atOrAfter`. Las únicas listas deliberadas son `TAIL_PHASES` (`introSkip.ts`) y `Presentation` (`openingMachine.ts`), atadas por tests.
2. **La máquina de apertura (`src/intro-draw/openingMachine.ts`) define tres caminos de entrada** en `SEQUENCE`: `first` (primera visita), `returning` (visita que vuelve, sin warp) y `reduced` (movimiento reducido: del dibujo directamente a `site`).
3. **`next()` protege las transiciones:** el relleno solo avanza con la disponibilidad en `ready`, el dibujo nunca termina por tiempo, el fatal es definitivo y `rewind` nunca saca la apertura de `draw`.
4. **Hay una sola apertura por página.** La guarda `openingStore.ts` y la crea la app la primera vez que la pide (`getOpening()` en `src/loading/opening.ts`), con lo que publica el arranque: el camino de entrada (`returning`, `reducedMotion`), la disponibilidad de `bootState` y el relleno del dibujo. Al crearla se pone al día con lo que ya pasó (la disponibilidad queda fijada en `bootState`, el relleno en `isDone()`) y después sigue ambos.
5. **El arranque no importa la máquina.** El dibujo no la consulta y el chunk de arranque tiene presupuesto: crearla allí costaba ~1,5 KB y lo superaba. Si el arranque la importara a la vez que la app, Rollup la sacaría a un chunk compartido y el build fallaría.
6. **La fase tiene una sola fuente: la apertura.** `state.phase` (para el bucle de fotogramas) y la fase de React se escriben desde una misma suscripción (`useMasterTimeline`). El planificador de trabajo pregunta a la apertura directamente. La cola no escribe la fase.
7. **El reloj de la cola es `openingTail.ts`.** Las duraciones salen de la configuración de la intro y el orden de las fases, de `tail()` de la máquina. Cada fase empieza con un `elapsed` que la apertura tiene que aceptar, o la cola lanza un error. La cola se construye solo cuando el relleno ha sacado la apertura de `draw`; al construirse (y en cada salto hacia atrás) envía `rewind`, que la deja en la primera fase después de `draw`.
8. **El reloj avanza con el bucle de fotogramas** (`TransitionClockDriver`, montado el primero dentro del Canvas, con `clampFrameDelta`). No hay guarda de visibilidad ni eventos de pestaña oculta: rAF ya se para.
9. **React solo guarda la fase discreta.** Los valores continuos viven en el singleton `sequenceState.ts`, y los overlays se combinan con `max()`.
10. **Saltar hacia delante** (`seek`) dispara todas las señales y termina todos los movimientos del camino. **Saltar hacia atrás** reinicia y reproduce desde el principio. La app reconcilia a mano la pose del logo y la marca 2D.
11. **El replay de depuración pasa por el evento `replay`**, que la app envía antes de cambiar `replayKey`. La apertura vuelve a `draw` (la interfaz se desmonta y el planificador deja de admitir trabajo) y toma la cola completa aunque la visita fuera `returning`; el relleno del dibujo repetido la saca de nuevo.
12. gsap ya no forma parte del proyecto.

## Por qué

Nadie era dueño de la secuencia completa: la cola sembraba su propia máquina con eventos sintéticos y había tres copias de la fase. Quitar gsap ahorró unos 60 KB y un ticker de rAF, y un reductor se puede probar como una tabla.

## Qué se descartó

- XState: bytes en el closure más vigilado.
- `useReducer`: ata cada transición a un commit de React.
- Crear la apertura en el arranque y publicarla en `window.__vertigoIntro`: pasaba el presupuesto del chunk de arranque sin que nada del arranque la usara.
- Mantener el timeline de gsap reprogramando solo la ciudad.

## Se ha roto si…

Fallan `openingMachine.test.ts` (los caminos de entrada, «draw never ends on time», «fatal latches», «rewind»), `openingStore.test.ts`, `src/loading/opening.test.ts`, `useMasterTimeline.test.tsx` («the clock», «the page’s one opening») o `sceneVisibility.test.ts` («holds when a phase is inserted»).

## Afecta a

`src/intro-draw/openingMachine.ts`, `src/intro-draw/openingStore.ts`, `src/loading/opening.ts`, `src/experiences/earth/timeline/openingTail.ts`, `src/experiences/earth/timeline/useMasterTimeline.ts`, `src/experiences/earth/timeline/useIntroDraw.ts`, `src/experiences/earth/config/introConfig.ts`, `src/experiences/earth/config/sceneVisibility.ts`, `src/experiences/earth/config/sequenceState.ts`, `src/components/SceneCanvas.tsx`, `src/App.tsx`
