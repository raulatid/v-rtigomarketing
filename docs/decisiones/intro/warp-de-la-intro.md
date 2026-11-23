# El warp de la intro: las curvas del warp entre escenas, con el cambio de marca en el corte

**Estado:** vigente · **Desde:** 2026-11-23 (`300284d`, `15342fb`; bloque 9 de la entrega) · **Sustituye a:** la versión de 2026-08 de esta decisión (dos tramos entre estrellas, `Starfield` y un cruce por cero en `swap`), que venía de DECISIONS §26.6, §26.7 y §26.8

## Decisión

1. **La intro reproduce el warp entre la Tierra y Murcia.** Lee las mismas curvas (`WARP_LIMITS` en `src/utils/warpTransition.ts`) sobre un único progreso lineal: posición, velocidad (FOV y desenfoque) y destello negro completo. Lo único propio es su duración (`warpDuration`, 1,6 s por defecto). No hay segundo vocabulario de movimiento (ver [el warp entre la Tierra y Murcia](../transicion/warp.md)).
2. **La salida es la marca 2D, sola.** Antes del corte el canvas está vacío: la marca (DOM) se lanza hacia la cámara, crece como algo que se acerca (`launchScale`) y se desenfoca con la campana de velocidad mediante un filtro CSS (`svgWarpBlur`, `svgWarpStretch`), porque el `AfterimagePass` solo toca el framebuffer de WebGL. **No hay estrellas:** `Starfield` y `warpStarShader` se quitaron.
3. **La llegada es la pata de llegada a la Tierra** de la vuelta desde Murcia: la cámara sale cerca del planeta bajo el destello y se aleja hasta el reposo mientras cae el FOV (`CameraController.tsx`, rama de la fase `warp`). A diferencia de esa vuelta, mira al centro del globo todo el tiempo: el sitio de Murcia en el globo no es donde debe mirar una apertura. `normalFov` es `earthRestFov`.
4. **La marca 2D pasa a logo 3D en el corte, bajo el destello, en un solo tick** y nunca con un fundido. El logo vuelve desde el tamaño hacia el que crecía la marca y, al ritmo de la llegada, se reduce a su tamaño propio. En la primera visita `swap` ya no es una fase visible (dura 0). Solo ocurre si el logo está listo (`canSubstitute`). Si no lo está, la marca 2D vuelve ella misma y se queda a `shrinkScale` toda la sesión, por diseño (ver [plazo de carga](plazo-de-carga.md)).
5. **Sin pausa ni vuelta en el centro.** El logo espera en el centro hasta que ha llegado y sale hacia la esquina con `depart()`, que la cola llama en el cue de `orbits`. Así la salida y los satélites van en el mismo reloj. `corner` dura 0 en los dos caminos, pero conserva su sitio en la máquina: un seek a `corner` sigue significando «logo aparcado».
6. **La intro va sin sonido.** El warp entre escenas sí lo tiene (ver [efectos de sonido](../transicion/efectos-de-sonido.md)).

Cola de la primera visita, contada desde que acaba el dibujo: `shrink` 0,5 s → `warp` 1,6 s → `orbits` unos 1,7 s → **`site` a unos 3,8 s** (antes, 7,57 s). Valores: `introConfig.ts` (`shrinkDuration`, `warpDuration`, `normalFov`, `launchScale`, `svgWarpBlur`, `svgWarpStretch`, `toCornerDuration`) y `WARP_LIMITS`.

## Por qué

- La crítica del 2026-11-23: la intro era una cinemática demasiado larga para una web que tiene que convertir, y el viaje entre estrellas sobraba.
- Un solo vocabulario de movimiento: el visitante ve en la apertura el mismo salto que verá al ir a Murcia y volver.
- Cambiar las marcas en el corte, bajo el destello completo, elimina el fotograma en el que se podrían comparar las dos. Antes eso lo hacía un cruce por cero en una fase propia.
- Quitar las estrellas de la intro resta bytes al chunk de la escena.

## Qué se descartó

- Conservar estrellas en la salida (D1 del bloque 9).
- Conservar algo del giro del logo en el centro (D2).
- Sonido en la intro: antes de `site` no ha habido gesto.
- Antes, ya descartados: una curva de suavizado sobre el progreso, una explosión de partículas en el cruce, igualar la silueta del modelo y un afterimage sostenido (exigiría el composer).

## Se ha roto si…

- Falla `npm run check:warp` §8 («The intro's warp is this warp»): `normalFov` = `earthRestFov`, la Tierra sale justo en el corte, la llegada se aleja hasta el reposo y el cambio de manos ocurre en el primer fotograma tras el corte, a 60 y a 30 fps, con el destello a 1 y el logo al tamaño de la marca.
- Fallan `sceneVisibility.test.ts` («the Earth appears at the warp cut, under its flash»), `useMasterTimeline.test.tsx` («plays the whole tail, warp included, with no swap of its own» y el bloque «the warp»), `openingMachine.test.ts` («the substitution requires the logo») o `logoMotion.test.ts`.
- Lo visual (la marca lanzándose, el destello y la llegada) hay que juzgarlo a ojo con un replay en `/debug`.

## Afecta a

`src/experiences/earth/timeline/openingTail.ts`, `src/experiences/earth/camera/CameraController.tsx`, `src/experiences/earth/config/sceneVisibility.ts`, `src/experiences/earth/config/introConfig.ts`, `src/intro-draw/openingMachine.ts`, `src/corner-logo/logoMotion.ts`, `src/utils/warpTransition.ts`, `checks/warp-transition.ts`
