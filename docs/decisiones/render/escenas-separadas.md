# Cada mundo tiene su escena

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, `ebf6b47`, ADR 001) · **Sustituye a:** DECISIONS §3, ADR 001 (cláusula de escenas) y la fila «One `THREE.Scene`, two environments» de «Superseded»

## Decisión

1. **Earth y Murcia tienen cada uno su `THREE.Scene` y su cámara.**
   - Earth es la escena y la cámara por defecto de R3F; la cámara se configura en el `<Canvas>` de `SceneCanvas.tsx`. Es el estado final: Earth no se convertirá en un `RenderableExperience` (ver [el pipeline dibuja un contrato](el-pipeline-dibuja-un-contrato.md)).
   - Murcia crea la suya (`createScene.ts`) y la expone con `scene` y `viewCamera`; sus planos son los de `camera` en `murciaConfig.ts`.
2. **La transición cambia qué escena dibuja el pipeline;** no oculta nodos dentro de una escena común. La escena inactiva no se pasa a ninguna llamada de dibujo.
3. **Ninguna cámara se comparte.** Los planos cercano y lejano de cada mundo son distintos, y cada cámara tiene su propio escritor por fotograma (ver [cámara de Earth](../earth/camara-de-earth.md)).
4. **El logo de esquina tiene una tercera escena** (`createCornerLogo.ts`), que no es de ningún mundo y se dibuja encima como pase superpuesto.

## Por qué

Una escena compartida rompe las reglas de Murcia: un nodo con `visible = false` sigue apareciendo en raycasts, `Box3.setFromObject` y `traverse`, así que las mediciones de la ciudad verían la Tierra; y las luces y la niebla son globales de la escena, de modo que cada mundo iluminaría el otro. Además, no dibujar una escena es más barato que recorrer un grafo con la mitad oculta.

## Qué se descartó

Una sola escena con dos entornos (la regla del prototipo de Murcia).

## Se ha roto si…

Sin test ni check. Síntomas: la ciudad iluminada por las luces de Earth (o al revés), mediciones de Murcia que incluyen la Tierra, o recortes raros al usar la cámara de un mundo con la escena del otro. El número de luces dentro de cada escena tiene su propia trampa ([transición](../../trampas/transicion.md), n.º 17).

## Afecta a

`src/components/SceneCanvas.tsx` (prop `camera`), `src/experiences/murcia/core/createScene.ts`, `src/experiences/murcia/MurciaExperience.ts` (`scene`, `viewCamera`), `src/experiences/murcia/config/murciaConfig.ts` (`camera`), `src/corner-logo/createCornerLogo.ts`, `src/graphics/RenderPipeline.tsx`
