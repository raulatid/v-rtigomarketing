# El ritmo del dibujo se mide en segundos visibles y es uniforme

**Estado:** vigente · **Desde:** 2026-09; dibujo en worker desde 2026-10 (ADR 016) · **Sustituye a:** DECISIONS §26.20, el párrafo del playhead en PROJECT_MEMORY §4 y el punto 3 de ADR 016

## Decisión

1. **Hay una duración mínima en segundos visibles** (`DRAW_TIMING.minimumDuration`). El tiempo transcurrido es tiempo real, sin recortar.
2. **Sin señal de carga, el avance es una rampa uniforme** hasta dejar una reserva, que luego se recorre a ritmo constante. El avance de un fotograma se raciona según el intervalo reciente entre fotogramas.
3. **El final (colapso y relleno) se mide desde que llega la disponibilidad**, no desde el principio, para que no quepa entero en un fotograma tras una espera larga.
4. **Solo cuenta el tiempo visible:** con la pestaña oculta el reloj no avanza.
5. **El dibujo se pinta en un worker con `OffscreenCanvas`** cuando el navegador lo permite (`canDrawOffThread()`). Si no, o si el worker falla, se pinta en SVG en el hilo principal. Ambos comparten la misma política (`drawLoop.ts`) y la misma pose (`drawPose.ts`).
6. **Las entradas solo llegan al worker en el viaje de ida y vuelta de un fotograma**, y los fotogramas anteriores a un replay se descartan por `generation`.

Valores: `DRAW_TIMING` y `DEFAULT_DRAW_CONFIG` en `src/intro-draw/drawConfig.ts`. Los pesos de las etapas son relativos; solo `fillDuration` está en segundos.

## Por qué

- Los visitantes decían «no empieza», «va demasiado rápido» y «se congela». El reloj anterior, recortado por fotograma, se estiraba muchísimo con pocos fps, y el suelo exponencial parecía parado.
- Un SVG en el hilo principal se congelaba con cada tarea larga.

## Qué se descartó

Recortar el tiempo transcurrido, el suelo exponencial, animar solo en el compositor (WAAPI no puede animar un `dash offset`) y meter el arranque en línea.

## Se ha roto si…

- Fallan `playhead.test.ts` (independencia de fps, sin asíntota, recuperación tras parón, final con duración propia, tiempo oculto, duración mínima) o `introDraw.worker.test.ts`.
- `e2e/boot.spec.ts` («gives the drawing its full duration») falla.
- **Inspección visual:** el antialiasing y los extremos de línea del canvas frente al SVG solo se juzgan mirando un dispositivo real.

## Afecta a

`src/intro-draw/playhead.ts`, `src/intro-draw/drawLoop.ts`, `src/intro-draw/drawPose.ts`, `src/intro-draw/introDraw.ts`, `src/intro-draw/drawWorker.ts`, `src/intro-draw/drawConfig.ts`
