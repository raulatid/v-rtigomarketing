# Los extremos del zoom de Earth y el presupuesto de texturas

**Estado:** vigente · **Desde:** 2026-09-21 · **Sustituye a:** DECISIONS §44 («And the band ends above the satellites» y su enmienda)

## Decisión

1. **El zoom de Earth es lineal en RADIO alrededor del reposo** (`earthZoomRadius`/`earthZoomScale` en `src/experiences/earth/camera/zoomPose.ts`).
2. **El extremo cercano queda por encima de los satélites, no a su altura:** la órbita más exterior de `ORBIT_PRESETS` multiplicada por `ZOOM_NEAR_CLEARANCE` (`zoomNearFactor` en `interactionConfig.ts`). Así sigue a las órbitas si cambian.
3. **Con las texturas estrechas (móvil), el extremo cercano está más lejos** (`zoomNearFactorNarrow`). El nivel de texturas se decide una vez y queda fijado (`usesNarrowEarthTextures()`), aunque el móvil gire.
4. **El extremo lejano es `zoomFarFactor`.** El reposo de escritorio es distinto, pero los dos extremos son comunes.
5. **El zoom escribe `orbit.radius`**, así que al salir de un primer plano se vuelve al zoom del visitante.
6. **Mapas de superficie:** dos juegos KTX2 (`EARTH_TEXTURES`, ancho y estrecho) separados por `narrowMaxWidth`.
7. El suelo del dolly del warp (`earthMinDollyRadius`) debe quedar por debajo de ambos extremos cercanos. Esa regla es de la [transición](../transicion/warp.md).

## Por qué

- Terminar en la órbita exterior aparcaba la cámara dentro de la constelación, y la superficie se veía en texels.
- El presupuesto de texturas de `earthConfig.ts` depende del encuadre y hay que rehacerlo si este cambia.
- Una banda lineal en radio reparte el aumento por igual a lo largo del gesto.

## Qué se descartó

Terminar a la altura de las órbitas, el extremo cercano fijado por el warp, mapas estrechos de más resolución (no lo arreglan) y leer el ancho vivo para el extremo cercano.

## Se ha roto si…

- Fallan `src/experiences/earth/camera/zoomPose.test.ts` («ends the zoom clear of the satellites…», «stops a narrow-texture viewport further out…», «zooming fully in still leaves the cut outside the planet», «zooming fully out stays well inside the star shell») o `earthConfig.test.ts` («LATCHES…»).
- `npm run check:warp` falla en §7.

## Afecta a

`src/experiences/earth/camera/zoomPose.ts`, `src/experiences/earth/interaction/interactionConfig.ts`, `src/experiences/earth/camera/createFocusCameraRig.ts`, `src/experiences/earth/config/earthConfig.ts`, `src/experiences/earth/scene/EarthScene.tsx`
