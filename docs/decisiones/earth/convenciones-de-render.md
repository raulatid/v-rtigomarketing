# Convenciones de render de Earth

**Estado:** vigente · **Desde:** 2026-08; día y noche en AVIF en escritorio desde el 2026-11-23 · **Sustituye a:** DECISIONS §26.9, §26.10 y §26.12

## Decisión

1. **Una textura horneada es dueña de su sombreado:** `metalness = 0`, `roughness = 1`, `flipY = false`, y el mapa se aplica a la plantilla antes de clonar. Hoy el único caso en Earth es el satélite.
2. **Las unidades de origen se mantienen y la escala se concilia en el montaje** (ver [satélites](satelites.md)).
3. **Todo `ShaderMaterial` crudo termina con `#include <colorspace_fragment>`**, porque three no le aplica la conversión de color de salida.
4. **Sustituir un `PointsMaterial` por un `ShaderMaterial`** obliga a reproducir la fórmula de tamaño, y los sprites necesitan puntos redondos (`src/experiences/earth/scene/space/pointSprite.ts`).
5. **Mapas de superficie de la Tierra:**
   - **Escritorio (viewport ancho con puntero principal fino): día y noche en AVIF** (`EARTH_TEXTURES.wideAvif` en `earthConfig.ts`), 4096×2048, 4:4:4, guardados de arriba abajo; el cargador los voltea al decodificar, como el cielo. Pesan la mitad que el par ETC1S y se acercan más al máster. A cambio suben a la GPU sin comprimir (RGBA8, unos 45 MB por mapa con mips, frente a unos 25 MB del juego KTX2 entero). Un navegador que no decodifica AVIF carga el KTX2 del mismo mapa (`EARTH_TEXTURE_FALLBACK`). La receta está en `04_Assets/optimizados/recodificacion-2026-11-23/`.
   - **Tableta (ancho con puntero grueso) y móvil: KTX2.** El iPad se queda en KTX2 hasta que se mida su memoria de GPU (decisión del usuario, 2026-11-22). Lo decide el puntero y no el ancho, porque una tableta es tan ancha como un portátil; las precargas de `index.html` usan las mismas media queries.
   - Las nubes son KTX2 en todos los juegos.
   - KTX2 ETC1S, con orientación abajo-izquierda obligatoria (`flipY` no tiene efecto en KTX2);
   - dimensiones múltiplo de 4 y con mipmaps;
   - nubes lineales; día y noche en sRGB.
   - Juego ancho: día y noche a 4096×2048; nubes a 2048×1024 desde el 2026-11-18. El shader solo umbraliza `.r`, y en el extremo cercano del zoom el 4096 no aportaba una diferencia apreciable que justificara 0,8 MB.
   - La máscara de nubes ancha (2026-11-18) se codifica desde el máster de 4k reducido a 2048, con cada nivel de mip llevado como mínimo a 120. Todo valor por debajo del umbral del shader se dibuja igual, y ETC1S gasta menos bits en la zona que no se ve: 321.140 → 113.628 bytes, más cerca del máster que el archivo anterior en todos los niveles. La receta está en `04_Assets/optimizados/recodificacion-2026-11-18/`.
   - Detalles en el comentario de `earthConfig.ts`. `prepare-earth-textures.mjs` no produce estos archivos.

## Se ha roto si…

- Falla `earthConfig.test.ts` (qué juego carga cada sesión, el respaldo de cada AVIF y que las precargas de `index.html` coincidan con los juegos) o `earthTextureLoader.test.ts` (el respaldo no llega al error fatal del manager).
- El resto no lo comprueba ningún test. Síntomas a ojo: algo «un poco oscuro», un globo al revés o un mapa negro. En la consola, `[earth] … did not decode, falling back to …` en un navegador que sí tiene AVIF.

## Afecta a

`src/experiences/earth/orbit/createSatellite.ts`, `src/experiences/earth/scene/earthTextureLoader.ts`, `index.html` (precargas), los shaders de `src/experiences/earth/` (`createHoloPanel`, `createEmitterCone`, `createHoverCue`, estrellas, Tierra, atmósfera, cielo), `src/experiences/earth/config/earthConfig.ts`
