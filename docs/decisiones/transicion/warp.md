# El warp entre la Tierra y Murcia

**Estado:** vigente · **Desde:** 2026-08-07; la salida de Murcia continúa el zoom desde 2026-09-04 · **Sustituye a:** DECISIONS §7 y §8, ADR 005 y ADR 006

## Decisión

1. **Es el warp de la intro.** Un único valor de progreso leído por tres curvas con anchos anidados: posición (ancho completo), velocidad (`speedPeakWidth`, mueve el FOV y el desenfoque) y destello (`flashWidth`). No hay un segundo vocabulario de movimiento.
2. **La transición publica el progreso y dispara el cambio de mundo, pero no mueve ninguna cámara.** Cada experiencia lee el progreso y mueve la suya. Por eso Earth y Murcia no saben nada la una de la otra, y las curvas viven en `src/utils/` para que `graphics/` y ambos mundos puedan leerlas.
3. **El progreso no indica una dirección.** Sube en el mundo que se deja y baja en el que se entra; cada mundo lo traduce a sus propias poses de salida y llegada.
4. **Murcia:**
   - **Al llegar**, empieza cerca (`warpCloseDistance`) y se aleja hasta el reposo, sin cambiar elevación.
   - **Al salir, sube.** Continúa el arco de alejamiento del zoom desde donde lo dejó el visitante hasta `warpDepartDistance` / `warpDepartElevationDegrees`. Salir de Murcia es alejarse: Murcia está dentro de la Tierra.
   - Durante el warp, el rig está reclamado por `'warp'`.
5. **Earth:**
   - Un dolly radial desde la posición viva de la cámara (al salir) o desde la pose general (al llegar), con escala `earthCloseFactor` y un suelo `earthMinDollyRadius` para no atravesar el planeta.
   - Un aumento del FOV entre `earthRestFov` y `earthWarpFov`, que vuelve al de reposo en ambos extremos.
   - Antes de salir hacia Murcia, la cámara gira hacia España (ver [giro de Earth hacia España](giro-de-earth-hacia-espana.md)).
6. **Murcia toma prestado el composer** mientras hay desenfoque o vacío (ruta `direct-composited`), con el bloom a 0, y vuelve a dibujar directo al canvas después. Fuera del warp, Murcia no usa el composer porque sus render targets no tienen MSAA.
7. **Con `prefers-reduced-motion`** no hay dolly, ni aumento de FOV, ni giro hacia España, ni vacío. Cada mundo se queda quieto («no hacer nada», nunca «volver al reposo»).

Valores: `WARP_TRANSITION` en `src/utils/warpTransition.ts`; poses de Murcia `warp*` y `zoomFar*` en `src/experiences/murcia/config/murciaConfig.ts`.

## Por qué

- **La salida de Murcia tiene que subir**, porque las dos formas obvias de hacer que la ciudad parezca más pequeña (más distancia o más FOV) agrandan su huella en el suelo, y con ella aparecería el borde del mundo en pantallas ultrapanorámicas. Inclinar la cámara reduce la huella más deprisa de lo que la distancia la aumenta.
- **La llegada a Murcia empieza cerca** porque llegar no cambia la elevación y no tiene con qué pagar alcance extra.
- **La restricción real es la huella, no la distancia.**

## Qué se descartó

- Una sola curva para ambos sentidos: hacía que al volver a la Tierra la cámara entrara en la ciudad antes de cortar a un globo.
- Abrir el FOV en Murcia.
- Arrancar el warp desde el reposo y no desde la pose del zoom: el primer fotograma saltaba.

## Se ha roto si…

`npm run check:warp` falla. Verifica las copias exactas de las poses de Murcia (§1), la vuelta al reposo (§2), el destello (§3), el desenfoque (§4), los tramos (§5), la huella en todas las poses y proporciones (§6) y la continuidad entre zoom y warp (§7).

## Afecta a

`src/utils/warpTransition.ts`, `src/app/useExperienceTransition.ts`, `src/experiences/murcia/camera/warpPose.ts`, `src/experiences/murcia/MurciaExperience.ts` (`setWarpPose`, `applyWarpPose`), `src/experiences/murcia/MurciaLayer.tsx`, `src/experiences/earth/camera/CameraController.tsx`, `src/components/SceneCanvas.tsx`, `src/graphics/renderableExperience.ts`, `src/graphics/RenderPipeline.tsx`, `checks/warp-transition.ts`
