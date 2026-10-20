# Cada fallo tiene un alcance: el sitio, un mundo o un adorno

**Estado:** vigente · **Desde:** 2026-08-07 (`5697070`: una ciudad que no carga no se ofrece); pérdida de contexto y WebGL 2 desde el 2026-08-14 (`c5c90aa`) · **Sustituye a:** ARCHITECTURE §23

## Decisión

1. **Fatal del sitio: sin ello no hay escena.** Sin WebGL 2, un error dentro del árbol de la escena, la pérdida de contexto, un paso obligatorio del arranque que falla o el plazo que vence. Se declara y no se recupera. Ver [fallos de WebGL](../render/fallos-de-webgl.md) y [plazo de carga](../intro/plazo-de-carga.md).
2. **Una ciudad que no carga no es fatal: no se ofrece.** `murcia:model` es opcional (ver [precarga de Murcia](../transicion/precarga-de-murcia.md)). Si `load()` falla, `MurciaExperience.isUsable` es falso, `MurciaLayer` no llama a `onReady`, `murciaReady` sigue en falso y no hay navegación hacia Murcia. Un fallo del módulo entero se registra en consola («the city will not be offered»).
3. **Un adorno que falla se pierde y el sitio sigue, con un aviso en consola:**
   - los pasos decorativos del arranque se marcan como hechos aunque fallen (ver [plazo de carga](../intro/plazo-de-carga.md));
   - el precalentado de Murcia (`warm()`): la ciudad se muestra, con un tirón en el primer fotograma;
   - los lightmaps: la ciudad carga sin hornear (ver [trampas de build](../../trampas/build.md), n.º 47);
   - la marca 3D del blog: se queda el SVG (ver [marca 3D en la cabecera](../blog/marca-3d-en-la-cabecera.md));
   - la pantalla del campus sin su malla: se queda apagada.
4. **Una violación de un invariante lanza un error, no se corrige en silencio.** Por ejemplo: la cola de la intro cuando la máquina rechaza un cambio de fase (`openingTail.ts`), o el contrato de los lightmaps (`loadUnifiedLightmaps.ts`, `unifiedManifest.ts`). Quien la recoge decide el alcance: la carga de lightmaps la convierte en el aviso del punto 3.

## Por qué

- Una entrada a un mundo que no puede dibujarse es peor que no tener entrada (comentario de `isUsable`).
- La ciudad no puede retener la intro: es otra experiencia, a la que solo se llega con un control que aún no existe mientras la intro corre (comentario de `murcia:model` en `bootState.ts`).
- Una decoración no debe impedir que el sitio exista, y un estado de reserva solo existe si está implementado.

## Qué se descartó

- Ofrecer la transición hacia una ciudad que no cargó.
- Tratar como fatal el fallo de cualquier paso.
- Restaurar un contexto perdido (ver [fallos de WebGL](../render/fallos-de-webgl.md)).

## Se ha roto si…

- `e2e/degraded.spec.ts` falla («no WebGL 2: says so, and never evaluates the scene chunk», «a blocked required asset is fatal, not a silent wait», «a blocked OPTIONAL asset still reaches ready»).
- `e2e/mobile.spec.ts` falla («a lost WebGL context says so instead of going quietly blank»).
- Falla `bootState.test.ts` («fatal is terminal»).
- Se ofrece la navegación hacia una ciudad que no cargó: **sin test** (`degraded.spec.ts` bloquea el GLB y solo comprueba que se llega a `ready`).

## Afecta a

`src/experiences/murcia/MurciaExperience.ts` (`isUsable`, `warm`), `src/experiences/murcia/MurciaLayer.tsx`, `src/App.tsx` (`murciaReady`, `handleContextLost`), `src/intro-draw/bootState.ts`, `src/components/SceneErrorBoundary.tsx`, `src/graphics/contextLoss.ts`, `src/experiences/murcia/assets/lightmaps/loadUnifiedLightmaps.ts`, `src/experiences/earth/timeline/openingTail.ts`, `src/blog/headerLogoRuntime.ts`, `src/experiences/murcia/campus/campusScreen/attachCampusScreen.ts`
