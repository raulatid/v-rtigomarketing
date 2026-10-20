# Nada hace fundido cruzado: corte seco bajo un destello

**Estado:** vigente · **Desde:** heredado del prototipo de Earth · **Sustituye a:** DECISIONS §6 y ADR 004 en lo que dicen del corte

## Decisión

1. **Toda sustitución de imagen es un corte seco oculto tras un momento de ocultación.** Estrellas → Tierra, logo 2D → logo 3D y Earth ⇄ Murcia. La música es la única excepción (ver [música](musica.md)).
2. **En el warp, el corte ocurre en `WARP_TRANSITION.cut`**, bajo el pico de un destello negro con forma de `narrowPeak` (ancho `flashWidth`), que parpadea en lugar de leerse como un fundido.
3. **El reloj de la transición** (`createTransitionClock`) dispara `onCut` una sola vez y fija el progreso exactamente en `cut` en ese fotograma.
4. **En el fotograma del corte se limpian los dos buffers del afterimage**, para que el mundo anterior no se mezcle con el nuevo.
5. Con `prefers-reduced-motion`, el destello y el corte se mantienen: ocultar un salto no es un efecto de movimiento.

## Por qué

Es el principio visual central del proyecto. Además abarata la transición: en el corte solo se dibuja una escena, nunca las dos.

## Se ha roto si…

- `npm run check:warp` falla en §3 (el destello vale 1 en el corte y 0 en los extremos).
- Fallan `transitionClock.test.ts` o `SceneCanvas.test.tsx` (`resetAccumulation`).

## Afecta a

`src/utils/transitionClock.ts`, `src/utils/warpTransition.ts`, `src/app/useExperienceTransition.ts`, `src/experiences/earth/camera/CameraController.tsx` (`applyOverlay`), `src/components/SceneCanvas.tsx`, `src/graphics/RenderPipeline.tsx`
