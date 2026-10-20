# El campus vuela su propia cámara y se la devuelve al rig

**Estado:** vigente · **Desde:** 2026-09-11 (`a7b4a3e`, `c856f84`); reclamación con nombre desde el 2026-09-21 (`d61a3e8`); encuadre junto a la placa desde el 2026-09-11 (`c050313`) y sobre la hoja del móvil desde el 2026-09-15 (`e8207d7`), ajustado el 2026-09-21 (`2e17a5f`) · **Sustituye a:** DECISIONS §45 (en parte: «The campus flies its own camera» y «The approach yaw is gone»); las filas de «Superseded» «A swap between buildings re-aims the flight and keeps the distance» y «The district camera frames around the panel that covers part of the canvas»; en §39, «the services camera stands out on the skirt side and looks back in»

## Decisión

1. **Durante toda la visita, la cámara es del campus** (`section/campusCamera.ts`): un vuelo propio de la posición y del punto de mira, con su propia curva. Escribe `camera.position` y la orientación directamente, como la [aproximación del blog](../blog/entrada-por-la-pantalla.md).
2. **El rig se reclama con el nombre `'campus'`** desde el primer vuelo hasta que aterriza la salida (`campusCameraAdapter.ts`). Mientras tanto, sus muelles no avanzan y el paneo rechaza toda pulsación. Cómo se reparten la cámara los dueños está en las [trampas de la cámara de Murcia](../../trampas/murcia-camara.md), n.º 17.
3. **La devolución es `adoptFromCamera` y después `release('campus')`**, y solo si el campus tiene la reclamación. La salida aterriza en la pose capturada al entrar, que produjo el propio rig, así que el primer fotograma de navegación no se mueve. Después corre `onCameraReturned`: la pose que un resize dejó aplazada (`applyDeferredPose`) y el aviso de atención.
4. **La pose de vuelta se captura al entrar**, nunca al construir el campus.
5. **El punto de mira se siembra antes de cada entrada** con el foco del rig a la altura `lookAtHeight` de la pose (`seed()`), no con el foco en el suelo.
6. **Las paradas están en un círculo alrededor del lago**, con la vuelta dividida a partes iguales entre ellas. La primera está en el azimut desde el que miraba el visitante: no hay giro de aproximación fijo. Entre paradas, la cámara sigue el arco, no la cuerda. Distancia y elevación: `cameraTuning` en `attachServicesCampus.ts`, escaladas desde el radio del lago. Todas las paradas miran al centro del disco (`focus()`).
7. **El encuadre desplaza la cámara, no la gira** (`CampusFraming`): cámara y punto de mira se mueven juntos, y el ángulo de vista no cambia.
   - En escritorio y en tableta apaisada (`CAMPUS_DOCK_QUERY` en `campusMobileLayout.ts`), el disco va a la derecha, junto a la placa (`dockedFraming` y `DISC_OVER_HALF_HEIGHT` en `createServicesCampus.ts`).
   - En el resto (móvil, tableta vertical), el disco va en la franja que deja libre la hoja en su parada compacta, y la cámara se aleja lo necesario, nunca menos que `SCALE_FLOOR` (`campusMobileFraming`). Expandir la hoja no mueve la cámara.
   - Con la cámara parada, el encuadre se recalcula al redimensionar (`reframe`).
8. **Un resize durante la visita no escribe la pose del rig:** `MurciaExperience.setViewport` la guarda en `deferredPose` hasta la devolución.

## Por qué

- Las paradas están a una elevación y a una altura de mira que el rig no puede expresar (§45, `campusCameraAdapter.ts`).
- La pose se captura al entrar porque el campus se construye durante la intro de Earth: una pose tomada entonces devolvería al punto de llegada a un visitante que ya había paseado (`campusCamera.ts`).
- La semilla: el foco del rig está en el suelo, pero su cámara mira más alto. Con el foco, la vista cabecearía en el primer fotograma (`campusCameraAdapter.ts`).
- El azimut de partida hace de la entrada un travelling y no un giro. El giro fijo de antes lo imponía la plaza antigua, que ya no está en la ciudad (§45, `scene/cityDistrictBindings.ts`).
- Desplazar en vez de girar conserva el ángulo de vista ajustado (`campusCamera.ts`). La placa al lado repite, en espejo, la composición del primer plano de un satélite; en vertical, el disco no deja sitio para una placa al lado (`createServicesCampus.ts`).
- La reclamación con nombre: con el booleano compartido de antes, una salida que aterrizaba con Earth en pantalla devolvía la cámara libre (`d61a3e8`).
- `setPose` coloca la cámara, y la cámara la está moviendo el campus (`MurciaExperience.ts`). `check:campus` §7 mide cuánto la movería.

## Qué se descartó

- Expresar las paradas con el rig.
- Un giro de aproximación fijo y una distancia de vuelo en `cityDistrictBindings.ts` (retirados en `c856f84`).
- Reencuadrar alrededor de una placa que tapa el canvas, y reapuntar el vuelo al cambiar de edificio (§32).
- Mover la cámara al expandir la hoja del móvil.
- Una bandera privada «¿la tomé yo?» en el adaptador: el rig ya sabe responder (`hasClaim`).

## Se ha roto si…

- Falla `npm run check:campus` (`checks/campus-section.ts`): §1 un solo escritor durante la visita; §2 un arrastre no mueve nada; §3 «the fly-in starts looking where the visitor was looking» y «the exit lands on the pose entered from»; §4 independencia de los fps; §5 el anillo; §6 y §6b la devolución; §7 el resize aplazado.
- Falla `section/campusCamera.test.ts` (encuadre, arco, `reframe`, salida a la pose capturada).
- Falla `campusMobileLayout.test.ts` («never pulls the camera further back than the fraction that shipped»).
- Fallan los tests de reclamaciones de `src/experiences/murcia/camera/CameraRig.test.ts`.
- Que placa o hoja y disco no se solapen se juzga mirando; sin test.

## Afecta a

`src/experiences/murcia/campus/section/campusCamera.ts`, `src/experiences/murcia/campus/campusCameraAdapter.ts`, `src/experiences/murcia/campus/campusMobileLayout.ts`, `src/experiences/murcia/campus/createServicesCampus.ts`, `src/experiences/murcia/campus/attachServicesCampus.ts`, `src/experiences/murcia/MurciaExperience.ts` (`update`, `setViewport`, `applyDeferredPose`), `src/experiences/murcia/camera/CameraRig.ts`, `checks/campus-section.ts`
