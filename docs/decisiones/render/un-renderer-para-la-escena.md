# Un renderer, un canvas y un bucle para la escena

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, ADR 001 y ADR 002); acotada a la escena el 2026-09-04 (enmienda de ADR 013); regla de los rAF confirmada el 2026-10-20 · **Sustituye a:** DECISIONS §2, ADR 001 (renderer, canvas y bucle) y ADR 002; las filas «The 3D logo gets its own renderer» y «The application has one WebGL renderer» de «Superseded»

## Decisión

1. **La escena tiene un canvas, un `WebGLRenderer` y un bucle, y los tres son de R3F.** El `<Canvas>` de `SceneCanvas.tsx` crea el renderer; Earth, Murcia y el logo de esquina lo comparten. Nada de la escena crea otro.
2. **Solo el callback de fotograma de `RenderPipeline` dibuja en ese canvas.** Usa la prioridad 1 de `useFrame`, que quita el dibujo a R3F; por eso dibuja en cada fotograma, sin condiciones (ver [trampas de transición](../../trampas/transicion.md), n.º 15). Todos los demás `useFrame` van a prioridad 0, y entre ellos manda el orden de montaje. Con el blog abierto, el bucle entero se congela (ver [escena congelada](../blog/escena-congelada.md)).
3. **Regla de los rAF: un solo bucle dibuja la escena; lo que la escena lee por fotograma avanza dentro de él; los demás rAF no dibujan y se paran cuando no hacen falta.**
   - Los relojes de la intro y de la transición y el planificador de trabajo avanzan en `TransitionClockDriver`, montado primero dentro del Canvas (ver [trabajo por fase](../intro/trabajo-por-fase.md)).
   - Fuera del bucle hay rAF que no dibujan la escena: la entrada de navegación, el [cursor propio](../interfaz/cursor-propio.md), la medida de `CasePanel` mientras el panel está abierto (en escritorio se acepta tal como está), el dibujo de la intro hasta ceder el paso, el panel de depuración y aplazamientos de uno o dos fotogramas (foco, cargas pesadas, subidas de texturas).
4. **Excepción: dibujar fuera del bucle solo se admite en un render target fuera de pantalla, para precalentar** (`MurciaExperience.warm()` y el precalentado de pases de `RenderPipeline`; ver [precarga de Murcia](../transicion/precarga-de-murcia.md)). Quien lo hace restaura el target y el color de limpieza.
5. **El logo de esquina no tiene renderer, canvas ni bucle propios:** es un pase superpuesto del mismo pipeline (ver [el pipeline dibuja un contrato](el-pipeline-dibuja-un-contrato.md)).
6. **«Un renderer» se refiere a la escena.** La marca 3D de la cabecera del blog y del 404 tiene su propio renderer, fuera de la escena: ver [marca 3D en la cabecera](../blog/marca-3d-en-la-cabecera.md). En `/` hay un único canvas WebGL; en un blog caliente, dos.

## Por qué

- El prototipo de Earth tenía dos contextos (el logo llevaba el suyo) y con Murcia habrían sido tres. Varios contextos multiplican la memoria de GPU y complican la transición; el usuario pidió un solo renderer de R3F.
- La separación que daba el segundo contexto se reproduce sin él: profundidad con `clearDepth()`, cámara privada del logo, tone mapping aplicado una sola vez por camino.
- Un solo bucle impide que un reloj vaya un fotograma por detrás de quien lo dibuja: un rAF aparte que corriera después del de R3F pintaría cada fotograma del warp con el progreso anterior (comentario de `stepTransition` en `SceneCanvas.tsx`).

## Qué se descartó

- Un renderer por experiencia: conservaba los prototipos casi tal cual, pero son dos contextos.
- Que el logo de esquina conserve su renderer.
- Un segundo bucle que dibuje la escena (`setAnimationLoop`, un rAF propio).

## Se ha roto si…

- `e2e/boot.spec.ts` («boots to a ready scene with a visible canvas») o `e2e/mobile.spec.ts` («boots on a phone…») ven más de un `canvas:not(.intro-canvas)`.
- `e2e/blog.spec.ts` («a warm round trip freezes the scene and never rebuilds it») no ve exactamente dos canvas.
- Falla `npm run check:render` (`checks/render-ownership.ts`): un `.render()` de renderer o composer fuera de `RenderPipeline` (y de las dos excepciones que lista con su motivo), otro `useFrame` con prioridad distinta de 0 o un `new WebGLRenderer` fuera de `src/blog/headerLogoRuntime.ts`.
- Un rAF propio dibuja o no se para: **sin test ni check**, solo revisión.

## Afecta a

`src/components/SceneCanvas.tsx`, `src/graphics/RenderPipeline.tsx`, `src/corner-logo/createCornerLogo.ts`, `src/corner-logo/CornerLogoLayer.tsx`, `src/experiences/murcia/MurciaExperience.ts` (`warm`), `src/blog/headerLogoRuntime.ts`, `src/components/CasePanel.tsx`
