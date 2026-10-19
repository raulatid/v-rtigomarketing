# Pose de reposo de la cámara de Murcia

**Estado:** vigente · **Desde:** 2026-09-18 (`67661d5`), por indicación del cliente · **Sustituye a:** DECISIONS §7, §25, §39 y §44 en lo que dicen de la pose

## Decisión

Al llegar a Murcia, la cámara se coloca en una pose fija pensada para que **todos los hitos estén en plano desde el primer fotograma**: catedral, torre, pantalla del blog y estadio de servicios. Que el visitante los vea al aterrizar, sin tener que buscarlos girando.

Los valores viven solo en el código:

- Elevación y distancia: `ELEVATION_DEGREES` y `CAMERA_DISTANCE` en `src/experiences/murcia/config/murciaConfig.ts`.
- Azimut y encuadre inicial: `azimuthDegrees` e `initialFocus` en `murciaConfig`, mismo archivo.
- Retrato tiene su propia pose: `cameraPortraitOverrides`.

El comentario que precede a esas constantes explica cada valor y su historia. Si cambias la pose, actualiza ese comentario, no este archivo.

## Por qué

El cliente comparó capturas contra un fotograma de referencia de la llegada. La pose anterior obligaba a girar para descubrir el estadio y la orilla lejana.

## Qué se descartó

- Las poses anteriores (más baja y más cercana). La pose cercana se había elegido para recuperar rango de paneo bajo el límite del ojo de §39, que ya no existe (ver [límites de la cámara](limites-de-camara.md)).

## Qué arrastra

La banda de zoom se movió con la pose: el extremo lejano (`zoomFarDistance`, `zoomFarElevationDegrees`, `zoomFarPortraitOverrides`) y la pose de salida del warp (`warpDepart*`) están por fuera del reposo. El acercamiento máximo es `CAMERA_DISTANCE × zoomNearScale`.

## Se ha roto si…

- `npm run check:footprint`, `check:warp` o `check:navigation` fallan tras tocar la pose. Son las tres puertas de cualquier cambio aquí.
- Al aterrizar desde la Tierra a 1600×900, alguno de los cuatro hitos queda fuera de plano (inspección visual).

## Afecta a

`src/experiences/murcia/config/murciaConfig.ts`, `src/experiences/murcia/camera/zoomPose.ts`, `src/experiences/murcia/camera/warpPose.ts`
