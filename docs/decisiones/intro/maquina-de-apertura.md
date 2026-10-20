# La apertura es una máquina de estados con un reloj propio

**Estado:** vigente · **Desde:** 2026-10-19 (`19ca65d`, `7abc389`, ADR 016) · **Sustituye a:** DECISIONS §26.1, §26.2 y §26.3 (con su enmienda) y las partes de máquina y reloj de ADR 016

## Decisión

1. **Las fases se comparan por orden, nunca como lista.** `Phase` y `PHASE_ORDER` están en `src/experiences/earth/config/introConfig.ts`, y toda comparación pasa por `atOrAfter`. Las únicas listas deliberadas son `TAIL_PHASES` (`introSkip.ts`) y `Presentation` (`openingMachine.ts`), atadas por tests.
2. **La máquina de apertura (`src/intro-draw/openingMachine.ts`) define tres caminos de entrada** en `SEQUENCE`: `first` (primera visita), `returning` (visita que vuelve, sin warp) y `reduced` (movimiento reducido: del dibujo directamente a `site`).
3. **`next()` protege las transiciones:** el relleno solo avanza con la disponibilidad en `ready`, el dibujo nunca termina por tiempo y el fatal es definitivo.
4. **El reloj de la cola de la intro es `openingTail.ts`.** Las duraciones salen de la configuración de la intro. Cada cambio de fase debe ser aceptado por la máquina o la cola lanza un error. La cola se construye solo cuando termina el relleno del dibujo.
5. **El reloj avanza con el bucle de fotogramas** (`TransitionClockDriver`, montado el primero dentro del Canvas, con `clampFrameDelta`). No hay guarda de visibilidad.
6. **React solo guarda la fase discreta.** Los valores continuos viven en el singleton `sequenceState.ts`, y los overlays se combinan con `max()`.
7. **Saltar hacia delante** (`seek`) dispara todas las señales y termina todos los movimientos del camino. **Saltar hacia atrás** reinicia y reproduce desde el principio. La app reconcilia a mano la pose del logo y la marca 2D.
8. gsap ya no forma parte del proyecto.

## Por qué

Nadie era dueño de la secuencia completa. Además, quitar gsap ahorró unos 60 KB y un ticker de rAF, y un reductor se puede probar como una tabla.

## Qué se descartó

- XState: bytes en el closure más vigilado.
- `useReducer`: ata cada transición a un commit de React y no puede existir antes del chunk de la app.
- Mantener el timeline de gsap reprogramando solo la ciudad.

## En desarrollo

La migración de ADR 016 está a medias y sigue en curso (confirmado el 2026-10-20). El objetivo es una única máquina global, creada por el arranque, adoptada por la app y alimentada por los eventos de disponibilidad, relleno, ocultación, visibilidad y replay.

Lo que hay hoy:
- una máquina por cola, sembrada con eventos sintéticos de disponibilidad y relleno;
- los eventos `hidden`, `visible` y `replay` solo se envían en tests;
- el dibujo no lo conduce la máquina;
- el planificador lee `state.phase`, no la máquina.

Al tocar esta zona, avanza hacia el objetivo y actualiza este archivo.

## Se ha roto si…

Fallan `openingMachine.test.ts` (los caminos de entrada, «draw never ends on time», «fatal latches»), `useMasterTimeline.test.tsx` («the clock», «agrees with the opening machine») o `sceneVisibility.test.ts` («holds when a phase is inserted»).

## Afecta a

`src/intro-draw/openingMachine.ts`, `src/experiences/earth/timeline/openingTail.ts`, `src/experiences/earth/timeline/useMasterTimeline.ts`, `src/experiences/earth/config/introConfig.ts`, `src/experiences/earth/config/sceneVisibility.ts`, `src/experiences/earth/config/sequenceState.ts`, `src/components/SceneCanvas.tsx`, `src/App.tsx`
