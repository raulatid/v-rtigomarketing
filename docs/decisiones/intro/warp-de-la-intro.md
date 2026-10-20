# El warp de la intro: dos tramos, un corte oculto y un cruce por cero

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** DECISIONS §26.6, §26.7 y §26.8

## Decisión

1. **El warp son dos tramos sin relación entre sí y un corte oculto.** La cámara no recorre el espacio intermedio: el tramo 1 va de `STAR_REST` a `STAR_EXIT` entre estrellas, y el tramo 2 va de `EARTH_FAR` al reposo de la Tierra. El corte es el teletransporte.
2. **Tres curvas anidadas sobre un único progreso**, igual que el warp entre mundos: posición, velocidad (aumento de FOV y desenfoque) y destello, este último más estrecho para que parpadee. El progreso de la cola es lineal a propósito.
3. **El campo de estrellas existe porque no hay ciudad** de la que alejarse: un `THREE.Points` (`Starfield.tsx`) da la referencia de movimiento al tramo 1. Solo se ve en `shrink` y en el tramo 1.
4. **La sustitución de la marca 2D por el logo 3D es un cruce por cero.** La marca se encoge hasta desaparecer en `swapCrossover` y, en el mismo tick, arranca el logo 3D bajo un destello. Solo ocurre si el logo está listo (`canSubstitute`); si no, la marca se queda a `shrinkScale` toda la sesión, por diseño (ver [plazo de carga](plazo-de-carga.md)).

Valores: `introConfig.ts` (`sceneSwapProgress`, `swapCrossover`, `swapFlash*`, `overlayStrength`, `normalFov`, `maxTravelFov`) y `CameraController.tsx` (`STAR_REST`, `STAR_EXIT`, `EARTH_FAR`, el ancho del destello).

## Por qué

- Las curvas anidadas hacen que el desenfoque crezca mientras el destello parpadea.
- Sin ciudad, el tramo 1 sería una pantalla negra con un FOV que se abre.
- Pasar por cero elimina el fotograma en que se podrían comparar las dos marcas.

## Qué se descartó

Una curva de suavizado sobre el progreso, una explosión de partículas en el cruce, igualar la silueta del modelo y un afterimage sostenido (exigiría el composer).

## Se ha roto si…

- Fallan `sceneVisibility.test.ts` («hands over exactly at sceneSwapProgress», «keeps the stars up for the whole shrink phase»), `openingMachine.test.ts` («the substitution requires the logo») o `useMasterTimeline.test.tsx` («plays the whole tail, warp included»).
- Ningún harness cubre este warp (`check:warp` solo cubre Earth ⇄ Murcia): hay que juzgarlo a ojo.

## Afecta a

`src/experiences/earth/camera/CameraController.tsx`, `src/experiences/earth/config/sceneVisibility.ts`, `src/experiences/earth/config/introConfig.ts`, `src/experiences/earth/timeline/openingTail.ts`, `src/experiences/earth/scene/Starfield.tsx`
