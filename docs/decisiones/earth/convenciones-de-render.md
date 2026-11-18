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
   - Juego ancho: día y noche a 4096×2048; nubes a 2048×1024 desde el 2026-11-18. El shader solo umbraliza `.r`, y en el extremo cercano del zoom el 4096 no aportaba una diferencia apreciable que justificara 0,8 MB.
   - La máscara de nubes ancha (2026-11-18) se codifica desde el máster de 4k reducido a 2048, con cada nivel de mip llevado como mínimo a 120. Todo valor por debajo del umbral del shader se dibuja igual, y ETC1S gasta menos bits en la zona que no se ve: 321.140 → 113.628 bytes, más cerca del máster que el archivo anterior en todos los niveles. La receta está en `04_Assets/optimizados/recodificacion-2026-11-18/`.
   - Detalles en el comentario de `earthConfig.ts`. `prepare-earth-textures.mjs` no produce estos archivos.

## Se ha roto si…

Ningún test lo comprueba. Síntomas a ojo: algo «un poco oscuro», un globo al revés o un mapa negro.

## Afecta a

`src/experiences/earth/orbit/createSatellite.ts`, los shaders de `src/experiences/earth/` (`createHoloPanel`, `createEmitterCone`, `createHoverCue`, estrellas, Tierra, atmósfera, cielo), `src/experiences/earth/config/earthConfig.ts`
