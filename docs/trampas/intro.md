# Trampas: intro y arranque

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/intro/`](../decisiones/intro/).

## Arranque y carga

1. **`intro-draw/` no importa nada.** Un solo import de valor arrastra un chunk compartido y da un import al chunk de arranque. Fija: la comprobación de `vite.config.ts` en el build, `check:architecture` §3 y `boot.test.ts`.
2. **Todo lo que ve el visitante lee el progreso medido y la disponibilidad, nunca el playhead.** La rampa autónoma llega a la espera aunque no se haya descargado ni un byte. Código: `drawLoop.ts`. Fija: `e2e/boot.spec.ts` («never reports ready before it is»), `introDraw.quiet.test.ts`.
3. **Un paso obligatorio necesita un camino de éxito y otro de fallo**, y un paso decorativo falla con `markDone`. Si no, cada visitante espera hasta `hardDeadline`. Fija: `e2e/degraded.spec.ts`.
4. **Un fatal después de ceder el paso no repinta nada**, porque el bucle del dibujo ya se ha parado. Solo se ve el aviso de pérdida de contexto de la app. Sin test.
5. **Las cargas asíncronas deben comprobar `disposed` antes de informar disponibilidad.** Con StrictMode, cada carga aterriza al menos una vez después de un dispose.
6. **Los límites de zona se derivan; nunca los escribas a mano.** Un 0,82 fijo congelaba el andamio a mitad de fundido. Fija: `stageLayout.test.ts`, `playhead.test.ts`.
7. **El final del dibujo se mide desde que llega la disponibilidad.** Si no, tras una espera larga, colapso y relleno caben en un fotograma. Fija: `playhead.test.ts` («plays the ending over its own duration when readiness is late»).
8. **Los límites del playhead se ajustan en su sitio (`setLimits`); no lo reconstruyas.** Reconstruirlo reinicia la duración mínima con cada edición de depuración.
9. **Las entradas solo llegan al worker en el viaje de ida y vuelta de un fotograma**, y hay que descartar por `generation` los fotogramas anteriores a un replay o un salto. Fija: `introDraw.worker.test.ts`.
10. **`alpha: false` exige `gl.setClearColor(0x050507, 1)`**, o el fondo de la intro se vuelve negro puro. Código: `SceneCanvas.tsx`. Fija en parte: `e2e/boot.spec.ts` («never paints a light frame during boot»).
11. **El arranque tiene copias de solo lectura de los formatos de los registros de consentimiento y de intro.** Si subes `CONSENT_VERSION`, `returningVisitor.ts` debe seguirlo. Fija: `returningVisitor.test.ts`.

## Fases y reloj

12. **Las fases se comparan por orden.** Un conjunto escrito a mano dejó una vez la cámara varada. Las únicas listas deliberadas (`TAIL_PHASES`, `Presentation`) están atadas por tests.
13. **`bootToReady` no es `site`.** Detrás quedan unos 9 segundos de cola, y una aserción negativa pasa en silencio. En e2e usa los helpers `reachSite`.
14. **El driver del reloj de la intro se monta el primero dentro del Canvas, y el del planificador justo después.** Los callbacks de igual prioridad se ejecutan en orden de montaje. Sin test.
15. **`completed` se resuelve un tick antes de que exista la cola.** Una pulsación o un Escape en ese tick se rechaza. El e2e espera a `--intro-scale`.
16. **Escape en `site` vuelve a hacer seek y sacude el logo aparcado** (`snapToCorner`). Está protegido para el menú y los paneles; la pulsación está protegida por `canSkipTail`. Fija: `introSkip.test.ts`.
17. **Con pocos fps la cola va a cámara lenta:** cada fotograma avanza como mucho `MAX_FRAME_DELTA`. En headless, juzga los tiempos de la cola por sus escrituras, no por el reloj de pared.
18. **Saltar hacia delante no escribe lo que la cola no controla** (pose del logo, visibilidad de la marca, escala, warp): eso lo reconcilia `App.handleSeek`. Tras cualquier cambio de secuencia, prueba con un replay.
19. **El tamaño y el movimiento del dibujo van por las propiedades `--intro-base`, `--intro-scale` y `--intro-warp`.** Nunca por los atributos `width`/`height`, y solo con transforms, nunca con layout.
20. **La apertura la crea la app, no el arranque.** `boot.ts` no debe importar `openingMachine` ni `openingStore`: costaría ~1,5 KB de un chunk con presupuesto y, con la app importándolos también, Rollup los sacaría a un chunk compartido y el build fallaría. La app la pide con `getOpening()`. Fija: el presupuesto y la comprobación de arranque autónomo de `vite.config.ts`.
21. **El replay se envía a la apertura antes de cambiar `replayKey`.** Si no, el efecto que construye la cola corre con el `drawComplete` del dibujo anterior y recorre una apertura que vuelve a estar en `draw`. La cola no se construye mientras la apertura esté en `draw`. Fija en parte: `useMasterTimeline.test.tsx` («takes both phases back to draw on a replay…»); el orden en `App` no tiene test.
22. **Nadie más escribe `state.phase`.** Es el espejo de la apertura para el bucle de fotogramas, escrito en la misma suscripción que la fase de React. Para cambiar de fase hay que enviar un evento a la apertura. Fija: `useMasterTimeline.test.tsx` («the page’s one opening»).

## Warp de la intro

23. **El cambio de tramo usa el progreso suavizado (`travelT < 0.5`) y el corte usa el progreso crudo (`p >= sceneSwapProgress`).** Coinciden solo mientras `sceneSwapProgress` valga 0,5. Moverlo (es un deslizador de depuración) los desincroniza. Solo está fijado el lado del corte.
24. **Si el logo nunca está listo, la marca 2D se queda a `shrinkScale` toda la sesión.** Es por diseño.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Cualquier cosa en `src/intro-draw/` | `npx vitest run src/intro-draw` + `npm run check:architecture` |
| Cola, fases, salto, visita que vuelve | tests de `src/experiences/earth/timeline`, `src/loading/opening.test.ts`, `sceneVisibility.test.ts`, `introSkip.test.ts`, `introSeen.test.ts`, `motionPreference.test.ts` |
| Tamaño o imports del arranque | `vite build` (falla por imports o presupuesto); `VERTIGO_SKIP_BUDGETS=1` imprime tamaños |
| Flujo real | `npm run e2e` (`boot`, `degraded`, `consent`, `motion-preference`), solo si se pide |
| Warp de la intro, cruce, canvas frente a SVG | inspección visual en un dispositivo real |

Para probar caminos de fallo, bloquea peticiones con `page.route(...).abort()` y lee `window.__vertigoIntro.boot.readiness()` / `.pending()`. Fuera de producción, `window.__vertigoBootDebug` expone zonas, esperas y tiempo transcurrido.

## Posibles defectos sin verificar

- **La semilla de consentimiento de Playwright tiene una versión antigua** (`v: 3` en `playwright.config.ts`, frente a `CONSENT_VERSION` 4), así que se lee como «no preguntado». El banner aparecería en todos los specs, y «a refused consent stores nothing» podría estar pasando sin que haya ningún rechazo.
