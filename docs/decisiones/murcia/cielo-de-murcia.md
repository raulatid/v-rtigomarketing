# El cielo de Murcia es una cúpula siempre puesta, de la neblina a la noche con estrellas

**Estado:** vigente · **Desde:** 2026-10-22 (plan 027, sin commit todavía) · **Sustituye a:** el cielo plano (`scene.background` como único cielo de la ciudad)

## Decisión

1. **Una cúpula vista desde dentro, siempre puesta en la escena de la ciudad**, no solo en la sección [Conócenos](seccion-conocenos.md) (`environment/createSkyDome.ts`).
   - Es una esfera `BackSide` que se coloca en el vertex shader alrededor de la cámara que la dibuja: no hay que actualizarla por fotograma y sale bien en cualquier render de la escena (el fotograma, el precalentado y la captura del blog).
   - Se dibuja la primera (`renderOrder`), sin escribir profundidad y dentro del plano lejano, así que no puede tapar nada.
2. **El degradado depende de la altura de la dirección de vista:** en el horizonte, el color de la niebla; después, el azul de día; arriba, el color de noche (`skyNightColor` en `murciaConfig.ts`). Los tramos son `HAZE_TOP`, `NIGHT_FULL`, `STARS_FROM` y `STARS_FULL` en `createSkyDome.ts`.
3. **Estrellas como puntos** (`THREE.Points` con su shader), de tamaño fijo en píxeles CSS multiplicado por el `dpr`, que aparecen con la altura. Siempre el mismo cielo: posiciones con semilla.
4. **Sin tone mapping** en la cúpula ni en las estrellas, como `scene.background` y el color de la niebla: el horizonte tiene que ser exactamente el color de la niebla. Terminan en `colorspace_fragment` ([convenciones de render](../earth/convenciones-de-render.md)).
5. **`scene.background` se queda como estaba.** La cúpula lo tapa en todas partes, pero el precalentado y lo demás que lo lee siguen funcionando.
6. **Los satélites de Conócenos se dibujan con las mismas reglas** (colocados alrededor de la cámara, antes de la ciudad, sin profundidad): ver [sección Conócenos](seccion-conocenos.md).

## Por qué

- El canvas es opaco (`alpha: false`, [configuración del renderer](../render/configuracion-del-renderer.md)): nada detrás de él se ve. Y un degradado en pantalla no sigue la inclinación de la cámara: el cielo es función de la dirección de vista.
- Con un solo color de fondo, ninguna cámara que mire arriba ve un cielo, y la niebla del suelo se cortaba en línea recta contra él en el horizonte. Al empezar en el color de la niebla, ese corte desaparece.
- La vista de reposo no cambia: nunca mira por encima del primer tramo.

## Qué se descartó

- Un degradado en CSS detrás del canvas.
- Seguir con `scene.background` como cielo.
- Usar la panorámica del cielo de Earth ([cielo de Earth](../earth/cielo.md)): se probó y apenas aportaba, porque cerca del cénit cae en su casquete oscuro. Además Murcia no puede importar Earth.

## Se ha roto si…

- `npm run check:warp` falla: el warp y el pase de vacío dibujan esta escena.
- El horizonte vuelve a tener un corte recto, o la vista de reposo cambia de color. Solo visual: se mira el reposo, una vista de horizonte y la parada 3 de Conócenos.

## Afecta a

`src/experiences/murcia/environment/createSkyDome.ts`, `src/experiences/murcia/config/murciaConfig.ts` y `src/experiences/murcia/config/environmentConfig.ts` (`skyNightColor`), `src/experiences/murcia/MurciaExperience.ts` (creación, `setViewport`, `dispose`)
