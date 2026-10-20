# Convenciones de render de Earth

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** DECISIONS §26.9, §26.10 y §26.12

## Decisión

1. **Una textura horneada es dueña de su sombreado:** `metalness = 0`, `roughness = 1`, `flipY = false`, y el mapa se aplica a la plantilla antes de clonar. Hoy el único caso en Earth es el satélite.
2. **Las unidades de origen se mantienen y la escala se concilia en el montaje** (ver [satélites](satelites.md)).
3. **Todo `ShaderMaterial` crudo termina con `#include <colorspace_fragment>`**, porque three no le aplica la conversión de color de salida.
4. **Sustituir un `PointsMaterial` por un `ShaderMaterial`** obliga a reproducir la fórmula de tamaño, y los sprites necesitan puntos redondos (`src/experiences/earth/scene/space/pointSprite.ts`).
5. **Mapas de superficie de la Tierra:**
   - KTX2 ETC1S, con orientación abajo-izquierda obligatoria (`flipY` no tiene efecto en KTX2);
   - dimensiones múltiplo de 4 y con mipmaps;
   - nubes lineales; día y noche en sRGB.
   - Detalles en el comentario de `earthConfig.ts`. `prepare-earth-textures.mjs` no produce estos archivos.

## Se ha roto si…

Ningún test lo comprueba. Síntomas a ojo: algo «un poco oscuro», un globo al revés o un mapa negro.

## Afecta a

`src/experiences/earth/orbit/createSatellite.ts`, los shaders de `src/experiences/earth/` (`createHoloPanel`, `createEmitterCone`, `createHoverCue`, estrellas, Tierra, atmósfera, cielo), `src/experiences/earth/config/earthConfig.ts`
