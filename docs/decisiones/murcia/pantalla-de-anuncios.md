# Anuncios: la cámara vuela delante de la pantalla de la torre

**Estado:** vigente · **Desde:** 2026-10-21 (`8057303`)

## Decisión

1. **Un tap en el punto de Anuncios o en la propia pantalla LED lleva la cámara delante de ella** (`landmark/towerFocus.ts`). No hay nada que abrir: la pantalla es el contenido y su carrusel sigue igual.
2. **La pose se resuelve desde la pantalla medida** (`measureScreenFrame` en `towerTargets.ts`): centro, normal horizontal, alto y cuerda.
   - `solveScreenView` coloca la cámara de frente, sobre la normal, a la distancia en la que la pantalla llena `SCREEN_FILL` (0,7) de la vista en su eje más apretado. En escritorio manda el alto; en un móvil vertical, el que corresponda.
   - Con la cámara parada, el encuadre se recalcula al redimensionar.
3. **El vuelo dura 1,4 s, como el del campus**, y 0,12 s con movimiento reducido. Mueve la posición y un punto de mira juntos (`easeInOutCubic`). El punto de mira de partida está recto delante, a la distancia de la pantalla, así que el primer fotograma no gira nada.
4. **El rig se reclama con el nombre `'tower'`** desde el vuelo de entrada hasta que aterriza el de salida, y la escalera de `MurciaExperience.update` tiene su peldaño. La salida aterriza exactamente en la pose capturada al entrar. Después viene `adoptFromCamera` y luego `release('tower')`, solo si la reclamación es suya, y por último la pose que un resize dejó aplazada (`applyDeferredPose`).
5. **Se sale con Escape, con un tap en cualquier sitio menos la pantalla** (`PoiInteraction`), **o con un pellizco** (`releaseFocusedDistrict`). Un tap sobre la pantalla no sale.
6. **Mientras dura, cuenta como atención** (`hasFocusedDistrict`): la brújula y los puntos se ocultan, se rechaza el warp, el blog queda bloqueado y un resize no escribe la pose del rig.

## Por qué

- Desde la pose de reposo, la pantalla se ve de canto: los anuncios no se leen.
- La pose es la orientación de la pantalla a una distancia calculada, y el rig fija la elevación. Por eso el vuelo escribe la cámara directamente, como la [aproximación del blog](../blog/entrada-por-la-pantalla.md) y la [cámara del campus](../campus/camara-propia.md).
- Girar la vista por separado del recorrido la barría sobre la ciudad y perdía la torre a mitad de vuelo; un punto de mira la mantiene en cuadro.
- Aterrizar en la pose exacta deja al rig adoptar la cámara que soltó, sin salto en el primer fotograma de navegación.

## Qué se descartó

- Un panel o una ruta para Anuncios: de momento, solo ir a mirar.
- Un botón de volver.
- Interpolar la orientación por separado (`slerp`) de la posición.

## Se ha roto si…

- Falla `landmark/towerFocus.test.ts` (encuadre por alto y por ancho, vuelta a la pose exacta, una sola devolución, nada reclamado si la cámara es de otro).
- Fallan los tests de salida de `pointsOfInterest/poiInteraction.test.ts` («the way out from in front of the screen»).
- Fallan `check:navigation`, `check:warp` o `check:footprint`.
- Un edificio tapa la pantalla en la pose de llegada. Solo visual.

## Afecta a

`src/experiences/murcia/landmark/towerFocus.ts`, `src/experiences/murcia/landmark/towerTargets.ts`, `src/experiences/murcia/pointsOfInterest/poiInteraction.ts`, `src/experiences/murcia/camera/CameraRig.ts` (`CameraClaim`), `src/experiences/murcia/MurciaExperience.ts` (`update`, `setViewport`, `hasFocusedDistrict`, `releaseFocusedDistrict`)
