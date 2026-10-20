# La carga es real: progreso visual, progreso medido y disponibilidad son tres cosas

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** DECISIONS §10 y §26.5, y PROJECT_MEMORY §4

## Decisión

1. **Tres valores independientes:**
   - el progreso visual, que es del playhead del dibujo;
   - el progreso medido (`bootState.progress()`), ponderado por pasos;
   - la disponibilidad: `starting → loading → ready`, o `fatal`, que es definitivo.
2. **El manifiesto es `RESOURCES` en `src/intro-draw/bootState.ts`.** Cada paso es obligatorio u opcional, y el sitio está disponible cuando todos los obligatorios están completos. `setStep` es monótono. Un fallo en un paso opcional solo avisa.
3. **El progreso medido mueve el dibujo; la disponibilidad solo controla el final** (colapso y relleno).
4. **Los límites entre zonas del dibujo se derivan de los pesos de las etapas** (`layoutStages`, `stageLayout.ts`). Nunca se escriben a mano.
5. **Los textos de carga, en español, salen del progreso medido y de la disponibilidad, nunca del playhead** (`CAPTIONS` en `introDraw.ts`). «Casi listo» solo aparece cuando la disponibilidad es `ready`.
6. `murcia:model` se informa solo cuando la ciudad se construye en `site` (ver [precarga de Murcia](../transicion/precarga-de-murcia.md)).

## Por qué

Sin señal de carga, la rampa autónoma lleva igualmente el contorno hasta la espera. Un texto que leyera el playhead mentiría: se midió el dibujo al 81 % con la carga real al 36 %.

## Qué se descartó

- Un solo número de progreso para todo.
- Un límite fijo antes de la disponibilidad (el antiguo `PRE_READY_LIMIT`).
- Tratar un timeout como disponibilidad (ver [plazo de carga](plazo-de-carga.md)).

## Se ha roto si…

- Fallan `bootState.test.ts` («the manifest itself», «is ready only when every required resource is COMPLETE»), `playhead.test.ts` o `stageLayout.test.ts`.
- `e2e/boot.spec.ts` («never reports ready before it is») falla.

## Afecta a

`src/intro-draw/bootState.ts`, `src/intro-draw/playhead.ts`, `src/intro-draw/stageLayout.ts`, `src/intro-draw/drawLoop.ts`, `src/intro-draw/introDraw.ts`
