# El pipeline dibuja un contrato y obedece una ruta

**Estado:** vigente · **Desde:** 2026-08-13 (`668acee`, ADR 008); `FrameSettings`, `OverlayPass` y la tercera ruta desde el 2026-08-14 (`9735d53`); vacío desde el 2026-09-10 (`756ce4a`); Earth fuera del contrato, como estado final, confirmado el 2026-10-20 · **Sustituye a:** ADR 008; ADR 001 y ADR 002 en lo que dicen del composer y del pase del logo

## Decisión

1. **`graphics/` no conoce ninguna experiencia ni la capa de aplicación.** El pipeline recibe tres cosas:
   - `RenderableExperience` (`scene` y `viewCamera`) para la experiencia que dibuja directo, hoy Murcia;
   - `OverlayPass` para el logo de esquina;
   - `FrameSettings`, leído con un callback una vez por fotograma: la ruta y números (desenfoque, vacío, bloom, reinicio de acumulación).
   Murcia y el logo cumplen sus contratos de forma estructural, sin importarlos.
2. **Earth no es un `RenderableExperience`, y no lo será.** El pipeline dibuja Earth desde la escena y la cámara por defecto de R3F (`useThree()`). El caso especial es la decisión, no una deuda.
3. **`SceneCanvas` decide; el pipeline obedece.** La ruta (`RenderRoute`) tiene tres valores:
   - `composer`: Earth, con bloom, afterimage, vacío y `OutputPass`;
   - `direct`: Murcia, directo al canvas, para conservar el MSAA de `antialias: true`;
   - `direct-composited`: Murcia a través del composer mientras dura el desenfoque o el vacío del warp, con el bloom a 0 (ver [warp](../transicion/warp.md)).
   Si la ruta pide directo pero la experiencia aún no ha cargado, se dibuja por el composer.
4. **El orden de la cadena del composer es fijo:** `RenderPass` → bloom → afterimage → vacío → `OutputPass`. El porqué de cada posición está en `RenderPipeline.tsx` (ver [cielo](../earth/cielo.md) y [vacío](../transicion/vacio.md)).
5. **Un pase con intensidad 0 se desactiva**, no se deja corriendo a cero: bloom, afterimage y vacío. `OutputPass` siempre está activo, así que el último pase que escribe en pantalla nunca cambia. Los valores del bloom son de Earth (`bloomStrength`, `bloomRadius`, `bloomThreshold` en `introConfig.ts`).
6. **El tone mapping y el espacio de color de salida se aplican una sola vez por camino.** three solo los aplica en el shader cuando no hay render target: el composer trabaja en lineal y convierte en `OutputPass`; el camino directo y el pase del logo convierten en su propio dibujo.
7. **El logo de esquina es un pase superpuesto** sobre el mismo framebuffer, después de la experiencia: `autoClear = false`, `clearDepth()` y vuelta al `autoClear` anterior. Su reloj solo avanza mientras `isDrawable()`.
8. **El composer no se reconstruye al redimensionar:** recibe el tamaño y el `pixelRatio` del renderer en un efecto aparte.

## Por qué

- `RenderPipeline` importaba `MurciaExperience` y comparaba con el literal `'murcia'`, una dependencia que ARCHITECTURE §17 prohíbe y que nadie había decidido. Necesitaba dos propiedades; declaraba un módulo entero.
- Los valores por fotograma van por callback y no por props: una prop que cambia en cada fotograma es un render de React en cada fotograma.
- Los render targets del composer son HalfFloat y sin `samples`, es decir, sin MSAA. Para esferas, puntos y brillo es un buen trato; para los bordes duros de la ciudad, no. En el warp todo va borroso y deprisa, así que el desenfoque vale más que el antialiasing.
- Un pase desactivado no cuesta nada; uno a cero hace dibujos a pantalla completa que no cambian la imagen.

## Qué se descartó

- Que el pipeline infiera la ruta (comparando ids o leyendo el progreso de la transición).
- Pasar Murcia siempre por el composer.
- Dibujar el logo como un pase más dentro del composer: perdería su conversión de color propia y el MSAA.
- Convertir Earth en un segundo `RenderableExperience` (el «estado final» de ADR 008).

## Qué queda abierto

Plan `docs/plans/mejoras-2026-10/12-three-y-fluidez.md`, propuesta 4: `UnrealBloomPass` compila una variante de desenfoque por radio; reducirlas está sin hacer.

## Se ha roto si…

- `check:architecture` falla en «graphics/ does not import any experience», «graphics/ does not import the application layer», «corner-logo/ does not import any experience» o «a known edge is present».
- `SceneCanvas.test.tsx` («departure post-processing wiring») falla: ruta, bloom retenido, vacío o reinicio de acumulación.
- `e2e/backdrop.spec.ts` cambia de píxeles (bloom, tone mapping o cadena del composer de Earth).
- El propio `RenderPipeline` (orden de pases, desactivación, pase del logo, caída al composer) **no tiene test**: `SceneCanvas.test.tsx` lo sustituye por un doble.

## Afecta a

`src/graphics/renderableExperience.ts`, `src/graphics/RenderPipeline.tsx`, `src/graphics/vacuumPass.ts`, `src/components/SceneCanvas.tsx` (`readSettings`), `src/corner-logo/createCornerLogo.ts`, `src/experiences/murcia/MurciaExperience.ts` (`scene`, `viewCamera`), `src/experiences/earth/config/introConfig.ts` (bloom), `checks/architecture.ts`
