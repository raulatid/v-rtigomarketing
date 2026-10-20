# La pista de escena (Earth y Murcia)

**Estado:** vigente · **Desde:** 2026-09-23 (`56fefc7`); texto «Scroll o desliza» desde 2026-09-25 · **Sustituye a:** DECISIONS §41, §43 y §46, y la enmienda de §29 que retiraba la pista de Murcia

## Decisión

1. **Un solo componente para los dos mundos.** `SceneHint` lo renderiza la app una vez y nunca depende del mundo: `EarthHint` usa `gesture='in'` y `MurciaHint` usa `'out'`. No tiene prop `visible`.
2. **El texto** vive en `EarthHint.tsx` y `MurciaHint.tsx`, uno para puntero fino y otro para táctil. Hoy: «Scroll o desliza para viajar a Murcia» y «Zoom para viajar a Murcia», y lo mismo para volver a la Tierra.
3. **Se renderizan los dos glifos y las dos frases**, y una sola regla `(pointer: coarse)` elige glifo y frase a la vez:
   - puntero fino: un ratón con dos chevrones;
   - táctil: un móvil con una mano, cada dedo un trazo que gira sobre la palma.
4. **Cuándo se ve:** las capas del canvas (`HintLayer` en Earth, `MurciaHintLayer` en Murcia) escriben `data-visible` con una regla común (`createIdleWatch` en `src/interaction/hintIdle.ts`):
   - la pista aparece al llegar;
   - se mantiene un rato (`graceSeconds`) aunque el visitante actúe;
   - vuelve tras un tiempo quieto (`idleSeconds`).
   - Actuar es `pointerdown`, `wheel`, `keydown` o `touchstart`. `pointermove` no cuenta. Pasar el ratón sobre un satélite o un edificio cuenta como actuar.
5. **Permiso:** la app la permite cuando la atención está libre y el mundo está activo. Earth exige además `site`, y Murcia estar navegando. Depuración: `?hint=1`.
6. **Aspecto** (`.scene-hint` en `src/styles.css`):
   - el borde inferior es `--hint-floor` (mayor en móvil) más la flotación más el área segura;
   - el 85 % de alfa va en `color`, no en `opacity`;
   - fundido de entrada largo y de salida corto, con la flotación siempre activa;
   - con movimiento reducido no hay flotación ni bucles del glifo, pero sí fundidos.

## Por qué

- El cliente rechazó la cápsula de vidrio, no el texto.
- Con la regla anterior la pista desaparecía justo cuando el visitante probaba el gesto.
- La pista tiene que quedar por encima del aviso de copyright del pie.

## Qué se descartó

La placa `.nav-hint` (borrada el 2026-09-15), la figura de unas 770 partículas (§41), una pista que solo aparecía en reposo y se iba al primer toque (hasta el 2026-09-23), `pointermove` como acción, «Zoom» con ratón y `opacity: 0.85`.

## Se ha roto si…

- Fallan `EarthHint.test.tsx`, `MurciaHint.test.tsx`, `hintIdle.test.ts` o `hintConfig.test.ts`.
- En e2e falla `navigation.spec.ts` («the Earth hint stands, steps aside for a busy viewer, and clears the footer while it floats»).
- **Sin cobertura:** la pista de Murcia en e2e, el movimiento reducido y el suelo de móvil.

## Afecta a

`src/components/SceneHint.tsx`, `src/components/EarthHint.tsx`, `src/components/MurciaHint.tsx`, `src/experiences/earth/hint/HintLayer.tsx`, `src/experiences/earth/hint/hintConfig.ts`, `src/experiences/murcia/hint/MurciaHintLayer.tsx`, `src/interaction/hintIdle.ts`, `src/styles.css`, `src/App.tsx`
