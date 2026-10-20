# Earth gira hacia España después del commit

**Estado:** vigente · **Desde:** 2026-09-17, por indicación del cliente · **Sustituye a:** DECISIONS §44 («Earth swings above Spain AFTER the commit» y los párrafos retirados sobre el giro guiado, el bloqueo de aproximación y el commit retenido)

## Decisión

1. **El visitante orbita libremente la Tierra hasta el commit**, a cualquier profundidad de zoom, y puede hacer clic en los satélites.
2. **Después del commit, y antes de la cinemática, hay una fase de duración fija** (`WARP_TRANSITION.earthDepartureAimSeconds`) en la que la cámara gira hasta quedar sobre el destino. Solo ocurre de Earth a Murcia.
3. **No forma parte de la cinemática:** `transitionCommitted` sigue en falso durante el giro, y es el propio rig de Earth el que coloca la cámara. Sigue habiendo un solo escritor de cámara. La señal es `departureAim` (0..1 o null).
4. **La entrada ya está bloqueada** durante el giro, y el arrastre del rig tiene su propio bloqueo (`setDepartureLock`). `transitioning` es verdadero desde el primer fotograma del giro.
5. **La órbita se coloca sin la suavización del rig** (`setOrbitAnglesImmediate`). El destino se lee en vivo y su azimut se desenrolla respecto al fotograma anterior, para que un objetivo a media vuelta no cambie de lado mientras gira el globo.
6. **El control accesible también pasa por el giro.**
7. **Con `prefers-reduced-motion` no hay giro.**

## Por qué

- El dolly del warp es radial y nunca re-orbita: una salida desde el otro lado del planeta lo atravesaría.
- La solución anterior (girar el globo con el propio zoom antes del commit) tenía que bloquear la órbita en gran parte de la banda y retener el commit para ganar la carrera a un gesto rápido. Se leía como si quitaran los controles. Una fase fija no tiene carrera.

## Qué se descartó

El giro guiado por el zoom (`destinationSteer.ts`), el bloqueo de aproximación (`setApproachLock`), `mayCommit`, el commit retenido y `earthGuideStart/End`.

## Se ha roto si…

- `departureContinuity.test.ts` (rig real, globo girando, commit desde el lado opuesto, a 30/60/120 fps) deja de aterrizar sobre el destino.
- `useExperienceTransition.test.tsx` ve `transitionCommitted` durante el giro.
- Falla `departureAim.test.ts`.

## Afecta a

`src/experiences/earth/camera/departureAim.ts`, `src/app/useExperienceTransition.ts`, `src/experiences/earth/interaction/InteractionLayer.tsx`, `src/utils/warpTransition.ts`
