# Trampas: transición y warp

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/transicion/`](../decisiones/transicion/).

## Corte y destello

1. **El destello tiene un único escritor en el DOM, y es de Earth, incluso cuando se ve Murcia.** `CameraController.applyOverlay` escribe `.warp-overlay` con el máximo de los tres overlays. Un retorno temprano antes de `applyOverlay()` en la rama inactiva de Earth elimina el destello de cada salida Murcia → Earth, y el corte queda a la vista. No lo fija ningún test que mire el DOM.
2. **El corte usa el progreso crudo; el cambio de tramo usa el progreso suavizado.** Coinciden solo porque `cinematicTravel` es simétrica respecto a 0,5. `transitionLeg` ignora `cut`: si mueves `cut`, las poses cambian de tramo en un fotograma distinto al del cambio de escena. Fija: `warpTransition.test.ts` («switches legs exactly once, and at the cut»).
3. **El fotograma del corte se pinta exactamente en `cut`, y `onCut` se dispara una sola vez.** Si el fotograma se pasara, el cambio se pintaría con el destello por debajo del máximo. Fija: `transitionClock.test.ts`, `check:warp` §3.
4. **El zoom se reinicia en el fotograma del corte, ANTES del cambio de mundo.** Un fotograma antes, la cámara que sale salta a la vista; uno después, el mundo que llega se aleja hacia el zoom del anterior. Fija: `useExperienceTransition.test.tsx` («returns the zoom to rest BEFORE the scene swaps»).
5. **Limpia los DOS buffers del afterimage en el fotograma del cambio.** Limpiar uno funciona la mitad de las veces según la paridad del fotograma; sin limpiar, el composer mezcla el mundo viejo con el nuevo: un fundido cruzado. La limpieza en `RenderPipeline` no tiene test; solo la señal (`SceneCanvas.test.tsx`).

## Reloj

6. **El driver del reloj debe montarse PRIMERO dentro del Canvas.** R3F ejecuta los callbacks de igual prioridad en orden de montaje; si se monta después, todas las cámaras leen el progreso del fotograma anterior. Código: `SceneCanvas.tsx`. Sin test.
7. **No hay guarda de `visibilitychange`, a propósito.** El reloj solo avanza en `step(dt)`, rAF se para con la pestaña oculta y `clampFrameDelta` limita un fotograma reanudado a `MAX_FRAME_DELTA`. El peligro solo vuelve si alguien reintroduce un reloj de pared.
8. **Un dispositivo lento alarga el warp en vez de saltárselo**, porque cada fotograma avanza como mucho `MAX_FRAME_DELTA`. Por debajo de 10 fps la duración real crece: los tests y perfiles por reloj de pared engañan.
9. **La protección contra reentrada** es `clock.start()` devolviendo `false` más `transitionTo` comprobando los dos relojes (giro y cinemática). Al desmontar se cancela sin disparar callbacks y se fijan a 0 overlay, progreso y `transitionCommitted`. Fija: `transitionClock.test.ts`, `useExperienceTransition.test.tsx`.

## Quién mueve la cámara

10. **Durante el warp, el rig de Earth se retira dejando de llamar a `update()`, nunca con `deactivate()`.** `activate()` resiembra desde la pose general y tiraría la pose de la que parte el dolly. Fija: `departureContinuity.test.ts`.
11. **La propiedad del rig depende de `transitionCommitted`, no de `transitionProgress > 0`.** Fija: `useExperienceTransition.test.tsx`.
12. **La reclamación `'warp'` de Murcia es `amount > 0 || departing`.** La envolvente vale 0 en los extremos, así que el primer fotograma de salida es idéntico a la vuelta al reposo `(0, false)`; usando solo `amount`, ese fotograma quedaría sin reclamar. La vuelta al reposo debe pasar `false`. Código: `MurciaExperience.setWarpPose`, `MurciaLayer.tsx`.
13. **Las experiencias no importan `app/`.** Las curvas viven en `utils/` para que `graphics/` y ambos mundos puedan leerlas. Fija: `check:architecture`.

## Composer y render

14. **Tomar prestado el composer trae el bloom de Earth, y hay que ponerlo a 0.** El suelo de Murcia supera el umbral de bloom de Earth. Fija: `SceneCanvas.test.tsx`.
15. **Un retorno temprano en el callback de fotograma de `RenderPipeline` deja el canvas en blanco**, no un efecto sin aplicar. Una ruta directa sin experiencia cargada cae al composer.
16. **`EffectComposer.dispose()` no recorre sus pases.** Cada pase, incluido el del vacío, debe guardarse en una variable y liberarse a mano.
17. **El número de luces se mantiene constante dentro de cada mundo:** cambiarlo recompila los programas de esa escena, y `warm()` compiló contra ese número. (Razonado a partir del estado de render por escena de three, sin verificar.)

## Precalentado

18. **`warm()` debe compilar AMBAS variantes de programa**, canvas y render target, porque three las distingue y el warp dibuja Murcia en los targets del composer. Faltar la segunda congeló la intro unos 0,6 s (2026-09-25). Sin test.
19. **`warm()` debe restaurar el color de limpieza del renderer.** `WebGLBackground` mete el cielo de la ciudad en el renderer COMPARTIDO, y la siguiente limpieza de Earth pinta un fotograma azul claro. Fija: `e2e/boot.spec.ts` («never paints a light frame during boot»).
20. **`warm()` debe revelar las piezas que nacen ocultas:** compilar y renderizar solo recorren objetos visibles. Fija: `whileRevealed.test.ts`.

## Poses y huella

21. **El FOV de Earth debe volver al de reposo en ambos extremos, y ese valor es una copia que nadie comprueba.** `WARP_TRANSITION.earthRestFov` debe ser igual a `introConfig.normalFov`, pero solo lo dice un comentario. Si cambias `normalFov`, el sitio queda con el FOV equivocado tras cada warp.
22. **El suelo del dolly tiene techo.** `earthMinDollyRadius` debe quedar por debajo del extremo cercano de la banda de zoom de Earth (`zoomNearFactor`, y `zoomNearFactorNarrow` en móvil). Si no, un commit desde el zoom máximo se queda quieto en lugar de zambullirse. Fija: `check:warp` §7, `zoomPose.test.ts`.
23. **La salida de Murcia debe continuar el arco del zoom:** `warpDepart*` más allá de `zoomFar*` en distancia y elevación, también en retrato. Fija: `check:warp` §7.
24. **La llegada a Murcia empieza cerca y se aleja**, porque no cambia la elevación. Por debajo de unas 60 unidades, el `lookAtHeight` fijo vuelve a agrandar la huella. Fija: `check:warp` §1 y §5.
25. **El ultrapanorámico es el caso que manda.** Tras CUALQUIER cambio de cámara en Murcia, vuelve a pasar `check:warp` y `check:footprint`.
26. **Las poses de Murcia están duplicadas en `WARP_TRANSITION`** (`murciaRest*`, `murciaCloseDistance`, `murciaDepart*`), con igualdad exacta exigida por `check:warp` §1. Hay que cambiar ambos sitios.

## Giro de Earth hacia España

27. **Es una fase fija después del commit, no un giro guiado por el zoom.** No reintroduzcas el bloqueo de aproximación, el commit retenido ni `mayCommit`. El reloj se queda exactamente en 1 durante un fotograma antes de ceder, porque su último valor en marcha siempre se queda un fotograma corto. Con la suavización del rig, la cámara se quedaría corta de España. Fija: `departureAim.test.ts`, `departureContinuity.test.ts`.

## Movimiento reducido y entrada

28. **Movimiento reducido significa «no hacer nada», nunca «volver al reposo».** El destello y el corte se mantienen. La preferencia se lee una vez por documento: un cambio del sistema a mitad de sesión solo se aplica al recargar. Fija: `e2e/motion-preference.spec.ts`.
29. **El bloqueo de entrada cubre toda la salida, giro incluido, y el enfriamiento empieza en el final real** (`onComplete` del reloj), no con la bandera `transitioning`. Esa bandera llega un render tarde y dejaría pasar la cola de inercia de un trackpad. Fija: `navigationMachine.test.ts`, `e2e/navigation.spec.ts`.

## Música

30. **La música se solapa con el corte; la imagen nunca.** El listener de desbloqueo debe seguir en `pointerup`, `touchend` o `keydown`. El momento del fundido cruzado no tiene test.

31. **Un efecto que no suena no es un fallo.** Se descarta si su clip no está en `SOUND_EFFECTS`, si aún no se ha decodificado, si el sonido está silenciado o si se repite dentro de su intervalo. Al encender el interruptor tarde, los primeros momentos pueden sonar mudos mientras se decodifican. Fija: `soundEffects.test.ts` (la admisión y los momentos, no el audio).

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Curvas, tiempos, destello, poses del warp | `npm run check:warp` + `warpTransition.test.ts` + `transitionClock.test.ts` |
| Cualquier pose de cámara de Murcia | `npm run check:warp` + `npm run check:footprint` |
| Ciclo de la transición, giro de Earth, bloqueo | `useExperienceTransition.test.tsx`, `departureAim.test.ts`, `departureContinuity.test.ts`, `navigationMachine.test.ts` |
| Vacío, ruta de render, bloom, afterimage | `SceneCanvas.test.tsx` |
| Precalentado | `whileRevealed.test.ts`; `e2e/boot.spec.ts` si se pide e2e |
| Música y efectos | `backgroundMusic.test.ts`, `soundEffects.test.ts`; `e2e/blog.spec.ts` si se pide e2e; el momento de cada efecto, a oído |
| Recorrido completo, móvil, movimiento reducido | `npm run e2e` (`navigation`, `mobile`, `motion-preference`), solo si se pide |

**Sin cobertura:**
- la escritura del destello en el DOM;
- la ruta de `RenderPipeline` y la limpieza del afterimage;
- el orden de montaje del driver del reloj;
- `earthRestFov == normalFov`;
- el desenfoque de movimiento con movimiento reducido (hoy no se suprime);
- la pose de llegada a Earth con movimiento reducido;
- el momento del fundido de la música y de cada efecto de sonido.

**Posible defecto sin verificar en navegador:** con movimiento reducido, al volver a Earth la cámara podría mostrar la pose de salida obsoleta desde el corte y saltar a la vista general cuando termina la cinemática, después de que el destello ya se haya despejado.
