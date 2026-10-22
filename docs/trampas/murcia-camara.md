# Trampas: cámara y navegación de Murcia

Errores reales y comportamientos que parecen bugs pero son intencionados. Cada trampa dice dónde vive en el código y qué la fija. Las decisiones están en [`decisiones/murcia/`](../decisiones/murcia/) y [`decisiones/navegacion/`](../decisiones/navegacion/).

## Huella en el suelo (footprint)

1. **La huella se dispara al bajar la inclinación.** El alcance lejano crece como `altura / tan(inclinaciónEfectiva − fov/2)`: un cambio pequeño de pose produce un cambio enorme e invisible de lo que se ve. Razona sobre la huella, nunca solo sobre la distancia. Código: `camera/applyPoseToCamera.ts`, `viewportFootprint.ts`. Fija: `check:footprint` §2 y `check:warp` §6.
2. **`lookAtHeight` baja la inclinación efectiva.** El rig mira a `lookAtHeight` por encima de un foco en y=0, así que el eje de visión es más plano que la elevación del rig. Subir `lookAtHeight` ensancha la huella. Código: `murciaConfig.ts` (`lookAtHeight`), `applyPoseToCamera.ts`.
3. **Más cerca no siempre es más seguro.** A poca distancia, el `lookAtHeight` fijo inclina la cámara hacia arriba y la huella vuelve a crecer (el «suelo de inversión», unas 60 unidades). `zoomNearScale` es una escala: cualquier cambio de `CAMERA_DISTANCE` se multiplica directamente en el acercamiento máximo. Fija: `check:footprint` §1 y `check:warp` §7.
4. **Alejarse es subir, no retroceder.** La mitad exterior de la banda interpola distancia y elevación a la vez; la interior solo distancia. El zoom nunca toca el FOV, porque ampliaría la huella gratis. Código: `camera/zoomPose.ts`, `zoomFar*` en `murciaConfig.ts`. Fija: `check:footprint` §1, `check:warp` §7.
5. **El extremo lejano de la banda es una medida, no una sensación.** `zoomFarDistance`, `zoomFarElevationDegrees` y su versión de retrato solo se mueven pasando `check:footprint` y `check:warp`. Una pose probada por URL (`?dist=`, `?elev=`…) es solo una candidata.
6. **La huella depende del azimut, y el ultrapanorámico (5120×1440) es el caso que manda.** Debe estar en todo barrido. Código: `checks/footprint.ts` (aspectos y paso de giro).
7. **Un rayo de huella recortado informa de menos, que es la dirección peligrosa.** `maxGroundDistance` debe quedar por encima del alcance real. Hoy esta matemática solo la leen los checks: en ejecución nada deriva límites de la huella. Fija: `check:footprint` §2 y §3.
8. **El plano lejano debe superar la esquina más lejana del faldón.** Comentario de `camera.far` en `murciaConfig.ts`. Fija: `check:footprint` §3.
9. **El faldón del terreno funde a alfa cero y nunca es coplanario con la placa.** `scene.background` no pasa por tone mapping, así que una geometría pintada del color del fondo sale más oscura. Por eso se funde a transparente, y el faldón queda `verticalOffset` por debajo y `innerOverlap` por dentro para que nada parpadee. Código: `createTerrainTransition.ts`, `murciaConfig.terrainTransition`. Fija: `createTerrainTransition.test.ts`, `check:footprint` §3.
10. **Las cifras del faldón se leen de la configuración, nunca se copian en un test.**
11. **El rectángulo navegable es el anillo A2 medido, y es asimétrico a propósito.** No redondees sus márgenes ni ganes rango de paneo debilitando el límite. Fija: `check:asset:contract` (`checks/city-asset.ts` §7b).

## Pose y warp

12. **La pose de reposo y la de salida están duplicadas en `src/utils/warpTransition.ts`** (`murciaRest*`, `murciaDepart*`) y un check exige igualdad exacta. Cambiar la pose obliga a editar ambos archivos. Fija: `check:warp` §1.
13. **El warp sale de la pose con zoom, no del reposo.** La salida (`warpDepart*`) debe quedar más allá de `zoomFar*` en distancia y elevación para todos los aspectos; si no, un commit desde el zoom máximo arrancaría acercándose a la ciudad. Fija: `check:warp` §7.
14. **La inclinación no es un gesto.** Un arrastre vertical es avance. La inclinación cambia solo con la mitad exterior de la banda, en el warp y con la inclinación hacia el cursor, y el rig la limita entre `MIN_PITCH_DEGREES` y `MAX_PITCH_DEGREES` (`CameraRig.ts`).
15. **`rig.getPose()` devuelve `murciaConfig.camera` por identidad.** Nunca lo mutes: construye una pose nueva. Para la distancia e inclinación vivas, usa `getEffectivePose()`.
16. **La línea `POSE` de depuración imprime la distancia y elevación CONFIGURADAS**, no las vivas con zoom. La distancia efectiva es `Cam distance`. Código: `DebugOverlay.ts`.

## Quién mueve la cámara

17. **Un solo dueño de la cámara por fotograma.** La propiedad es un conjunto de reclamaciones con nombre (`CameraClaim`: `'inactive' | 'warp' | 'campus' | 'blog' | 'about'`). Libera solo la tuya. La precedencia vive en la escalera de `MurciaExperience.update`, no en el rig: blog → warp → sección (`'campus'` o `'about'`, que ya escribieron la cámara) → nadie, y entonces el rig. **Una reclamación nueva sin peldaño congela la cámara.** El peldaño del warp tiene una excepción: si Conócenos tiene la cámara (el warp de «Ver sus casos» sale desde su parada del cielo), el warp mueve la cámara de la sección, no la pose del rig ([sección Conócenos](../decisiones/murcia/seccion-conocenos.md)). Los dueños externos escriben ESTADO (`setNavigated`, `setFocus`, `setYaw`, `adoptFromCamera`), nunca objetivos. Fija: `CameraRig.test.ts`, `check:campus`, `check:about`.
18. **Una experiencia inactiva no procesa entrada.** El canvas es compartido: el rig nace con la reclamación `'inactive'` y la entrada comprueba `rig.isOwned` al pulsar y al mover. Fija: `CameraRig.test.ts` («is born held…»), `createCameraInput.test.ts`.
19. **`setPose` recoloca la cámara, así que un rig reclamado no debe recibirla.** El campus y Conócenos aplazan el `setPose` de un resize hasta después de `adoptFromCamera`. `setPose` ya no toca distancia ni elevación (son estado del muelle), así que un resize con zoom no salta. Fija: `CameraRig.test.ts`, `check:campus`, `check:about`.
20. **Limita el objetivo, nunca el foco renderizado.** `clampTargetToBounds` actúa sobre `targetX/Z`. Fija: `check:navigation` §6.

## Entrada

21. **Los signos del arrastre son una decisión.** El mundo sigue al dedo; el signo contrario ya se reportó como «navegación al revés». Y en la órbita, lo que está más cerca que el objetivo se mueve al revés: no es un bug. Fija: `check:navigation` §2.
22. **Para un problema en móvil, nunca reajustes un número compartido.** Se separa por tipo de puntero, nunca por proporción (cambia si el móvil rota). Hoy la separación existe solo para el giro: el giro se normaliza por ANCHO (un píxel de móvil gira unas cuatro veces más) y el avance por ALTO, compartido.
23. **Las sensaciones se juzgan, no se razonan.** Las ganancias de `cameraTuning.ts` las fija una persona delante del dispositivo. El avance escala con `radius / TRAVEL_REFERENCE_RADIUS`, así que mover el reposo cambia la velocidad del arrastre a propósito.
24. **Las frecuencias del muelle son angulares de segundo orden, no constantes de tiempo.** Una cifra de antes de los muelles hay que convertirla (×1,58), no copiarla.
25. **Solo un dedo lanza.** La inercia lee únicamente la ventana final del trazo (`FLING_WINDOW_MS`), así que un dedo que se para y luego levanta no se desliza. Ratón, cancelación y el último dedo de un pellizco no lanzan. Una pulsación o una reclamación anulan el deslizamiento (lo descartan, no lo pausan). Fija: tests «the release throw».
26. **Murcia no tiene umbral de arrastre:** el mundo se mueve desde el primer píxel. Las dos tolerancias por tipo de puntero que quedan son de TAP, en el campus y en la pantalla del blog. Fija: `campusInteraction.test.ts`.

## Banda de zoom, pellizco y commit

27. **El zoom se reinicia en el corte, nunca en el commit.** Fija: `createNavigationInput.test.ts` («…preserves the zoom until the covered cut»).
28. **Un gesto que hace commit queda gastado, no solo sin dueño.** Su cola llega después del cambio de mundo y se interpretaría con el signo del mundo nuevo. Fija: `pinchInput.test.ts` («requires a new pair and deliberate growth, then spends its remaining movement»).
29. **Salir con un pellizco exige un gesto propio.** Si el pellizco puede hacer commit se decide al armar el par (`pinchMayCommit`), nunca a mitad del gesto. Fija: `pinchInput.test.ts`, `e2e/mobile.spec.ts`.
30. **El tope por evento está donde se alimenta el recorrido, no más adentro.** Una garantía puesta en una capa deja de valer en cuanto se inserta algo delante. En el pellizco, lo que excede el tope se arrastra al evento siguiente, no se pierde. Fija: `createNavigationInput.test.ts`, `zoomBand.test.ts`, `pinchInput.test.ts`.
31. **El pellizco se mide como crecimiento de separación en px frente al lado corto de la pantalla, no como proporción.** Con proporción, un agarre cerrado hacía commit con un centímetro de pulgar. Y los dos dedos nunca se mueven en el mismo evento: mide contra el origen del gesto. Fija: `pinchInput.test.ts`.
32. **Solo hay un dueño de la rueda:** un único listener `wheel` con `preventDefault` en `window`. Debe dejar pasar los paneles con scroll propio, tragarse ctrl+rueda (pellizco de trackpad) y suprimir los `gesture*` de Safari solo sobre `.scene-canvas`. Fija: `e2e/navigation.spec.ts`.
33. **El enfriamiento no puede salir solo por silencio, y el silencio se mide con `event.timeStamp`.** Una rueda que gira libre nunca calla; un reloj de pared contaría como silencio el tiempo con la pestaña oculta. Los valores de `NAVIGATION_COOLDOWN` no son de sensación. Fija: `navigationMachine.test.ts` («CANNOT DEADLOCK…»).
34. **El control accesible hace commit desde cualquier profundidad de zoom.** Fija: `createNavigationInput.test.ts`, `e2e/navigation.spec.ts`.

## Tests

35. **Un test que afirma que «no pasa nada» debe probar antes que llegó a la fase `site`.** Si no, pasa por no haber empezado. Código: `reachSite` en `e2e/navigation.spec.ts`.
36. **Mide la entrada de una corrección, nunca su salida.** Los harnesses ejecutan el código real y derivan lo esperado por su cuenta.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Entrada, signos, muelles, inclinación hacia el cursor | `npm run check:navigation` y los tests de `camera/` y `navigation/` de Murcia |
| Pose, banda de zoom, faldón, límites | `npm run check:footprint` + `npm run check:warp` + `npm run check:navigation` |
| Banda compartida, pellizco, rueda, enfriamiento | tests de `src/app/navigation/` |
| Anillo A2 o GLB de la ciudad | `npm run check:asset:contract` |
| Brújula, tinte de hover, puntos de interés | `compass.test.ts`, `compassBar.test.ts`, `buildingHighlight.test.ts`, tests de `pointsOfInterest/`, `towerTargets.test.ts` |
| Flujo completo en navegador | `npm run e2e` (`navigation.spec.ts`, `mobile.spec.ts`), solo si se pide |

**Huecos conocidos en la cobertura:**
- `checks/footprint.ts` §2/§3 coloca el foco solo en las esquinas de la PLACA, pero el objetivo puede llegar a las esquinas de `CITY_A2`, más lejos en −Z.
- `check:navigation` §6 limita contra el rectángulo de la placa, no contra `navigation.bounds`.
- Ningún test fija que la brújula no se mueva al cambiar solo la inclinación.
