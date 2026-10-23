# Con la pestaña oculta no avanza nada que la escena lea

**Estado:** vigente · **Desde:** 2026-08-13 (`8f883ef`, `MAX_FRAME_DELTA` como política única); sin guarda de visibilidad en la transición desde el 2026-09-10 (`756ce4a`) y en la cola de la intro desde el 2026-10-19 (`19ca65d`) · **Sustituye a:** ARCHITECTURE §22

## Decisión

1. **Los relojes que la escena lee avanzan solo con el bucle de fotogramas:** la cola de la intro, la transición y el planificador se mueven con `step(dt)` desde `useFrame` (ver [un renderer para la escena](../render/un-renderer-para-la-escena.md)). Con la pestaña oculta el navegador no da fotogramas, así que ni se dibuja ni avanza nada. No hay nada que pausar ni reanudar, ni un segundo bucle que duplicar.
2. **Ningún reloj de la escena escucha `visibilitychange`** (ver [trampas de transición](../../trampas/transicion.md), n.º 7).
3. **El fotograma que vuelve está acotado:** todo integrador por fotograma pasa su delta por `clampFrameDelta` (`MAX_FRAME_DELTA` en `src/graphics/frameDelta.ts`). Una pestaña que vuelve reanuda donde estaba; no avanza de golpe.
4. **Lo que mide tiempo de reloj, o suena, sí escucha la visibilidad, y cada uno decide qué hacer:**
   - la entrada de navegación se reinicia al ocultarse (`createNavigationInput.ts`);
   - la música se calla mientras la pestaña está oculta (motivo `hidden` en `audioOutput.ts`), sin cambiar lo que eligió el visitante;
   - el dibujo de la intro cuenta solo el tiempo visible y avisa a su worker (`introDraw.ts`; ver [ritmo del dibujo](../intro/ritmo-del-dibujo.md));
   - la marca 3D del blog para su rAF con la pestaña oculta o fuera de pantalla (`headerLogoRuntime.ts`).
5. **El zoom del visitante sobrevive a una pestaña oculta** (`zoomDepth`, ver [estado por fotograma](estado-por-fotograma.md)).

## Por qué

- gsap avanzaba con su propio reloj de pared. Al volver de una pestaña oculta saltaba hacia delante y podía pasar el fotograma del corte, que cambia de escena bajo la cubierta, sin cubrirlo. En iOS, cambiar de app a mitad de gesto es lo normal. Un reloj que solo avanza con fotogramas no puede reproducirlo (comentario en `useExperienceTransition.ts`).
- La guarda se borró en lugar de conservarla por si acaso: una guarda contra algo imposible se lee como una guarda contra algo posible.
- En la entrada, un hueco de minutos liberaría al instante el enfriamiento y reanudaría un gesto con un total viejo (comentario de `onVisibility` en `createNavigationInput.ts`).
- Sin contar solo el tiempo visible, el dibujo de la intro gastaría sus segundos sin nadie mirando.

## Qué se descartó

- Una guarda de `visibilitychange` en los relojes de la escena.
- Contar el tiempo oculto en el dibujo de la intro.

## Se ha roto si…

- Falla `playhead.test.ts` («Hidden time — the minimum duration is measured in visible time»).
- Falla `audioOutput.test.ts` («is silent while any reason suppresses it»). Prueba la regla, no el listener.
- Un reloj de la escena avanza con la pestaña oculta o salta al volver, o la entrada no se reinicia: **sin test**.

## Afecta a

`src/graphics/frameDelta.ts`, `src/utils/transitionClock.ts`, `src/app/useExperienceTransition.ts`, `src/experiences/earth/timeline/openingTail.ts`, `src/components/SceneCanvas.tsx`, `src/app/navigation/createNavigationInput.ts`, `src/app/audio/audioOutput.ts`, `src/intro-draw/introDraw.ts`, `src/blog/headerLogoRuntime.ts`
