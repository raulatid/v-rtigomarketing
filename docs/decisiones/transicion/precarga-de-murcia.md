# Precarga y precalentado de Murcia

**Estado:** vigente · **Desde:** 2026-10-19 (`e38b80c`, ADR 016) · **Sustituye a:** DECISIONS §5 y ADR 004 en lo que dicen de la precarga

## Decisión

1. **Los bytes de la ciudad se leen durante la apertura**, como trabajo de red que la apertura admite desde la fase `shrink` (`prefetchCityBytes`).
2. **La construcción de la ciudad (parseo, decodificación, montaje y precalentado) es trabajo del hilo principal y solo se admite en la fase `site`**, para no competir con la animación de apertura (ADR 016).
3. **Murcia nunca bloquea la disponibilidad del sitio.** Su entrada del manifiesto es `required: false`. Mientras no está lista, `murciaReady` impide navegar hacia ella.
4. **Precalentar (`warm()`) es más de una operación:**
   - compilar los programas dos veces, para el canvas y para un render target (`compileAsyncForRenderTarget`), porque el warp dibuja Murcia dentro del composer;
   - un render a un `WebGLRenderTarget` de 1×1 para subir buffers y texturas;
   - revelar durante el proceso las piezas que nacen ocultas (`whileRevealed`);
   - restaurar el color y el alfa de limpieza del renderer.
5. Los pases del warp (afterimage y vacío) se precalientan igual al montar `RenderPipeline`.

## Por qué

Que el mundo llegue sin compilar al fotograma de la transición produce un tirón visible. Construirlo durante la apertura, en cambio, la entrecortaba; por eso la red va pronto y el trabajo de CPU espera a `site`.

## Qué se descartó

- Cargar la ciudad bajo demanda, o mostrar un estado de carga dentro de la transición.
- Construir la ciudad durante la apertura (el comportamiento anterior a `e38b80c`).

## Se ha roto si…

- `e2e/boot.spec.ts` «never paints a light frame during boot» falla (el precalentado no restauró el color de limpieza).
- Falla `whileRevealed.test.ts`.
- La primera transición a Murcia da un tirón (no lo fija ningún test).

## Afecta a

`src/experiences/murcia/MurciaLayer.tsx`, `src/experiences/murcia/MurciaExperience.ts` (`warm`, `prefetchCityBytes`), `src/graphics/compileForTarget.ts`, `src/graphics/RenderPipeline.tsx`, `src/intro-draw/workScheduler.ts`, `src/intro-draw/bootState.ts`
