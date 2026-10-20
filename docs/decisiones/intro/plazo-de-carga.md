# La carga tiene un plazo, y el plazo solo puede fallar

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** ADR 007 y la cláusula de timeout de DECISIONS §26.5

## Decisión

1. **`DRAW_TIMING.timeoutNotice` es solo diagnóstico:** cambia el texto a «lento», escribe un aviso en consola y activa `waitedTooLong()`.
2. **`DRAW_TIMING.hardDeadline` marca la carga como fatal** y nombra los pasos obligatorios pendientes. Nunca declara el sitio disponible. Se cancela al llegar a `ready`.
3. **Cada paso obligatorio necesita un camino de éxito y otro de fallo.** Un paso decorativo (logo, precalentado de GPU, panorama del cielo) se marca como hecho aunque falle. Los esenciales (texturas de la Tierra, órbitas, el chunk de la escena, WebGL 2) son fatales.
4. Un fatal después de que el dibujo haya cedido el paso solo se ve a través del aviso de pérdida de contexto de la app.

## Por qué

- Un paso obligatorio que ni termina ni falla dejaría esperando para siempre.
- Un plazo no puede mostrar una escena que no está lista; solo puede mostrar el fallo.
- Una decoración no debe impedir que el sitio exista.

## Qué se descartó

- Un timeout que deje pasar a una escena sin cargar.
- Tratar como fatal el fallo de cualquier paso.

## Se ha roto si…

- `e2e/degraded.spec.ts` falla («a blocked required asset is fatal, not a silent wait», «a blocked OPTIONAL asset still reaches ready»).
- Fallan `bootState.test.ts` («fatal is terminal») o el caso 6 de `playhead.test.ts`.
- El temporizador del plazo no tiene test propio.

## Afecta a

`src/intro-draw/boot.ts`, `src/intro-draw/drawConfig.ts`, `src/intro-draw/bootState.ts`, los cargadores que informan cada paso (`EarthScene.tsx`, `OrbitSystemLayer.tsx`, `SkyShell.tsx`, `CornerLogoLayer.tsx`, `LazyScene.tsx`), `src/App.tsx`
