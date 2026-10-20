# El cielo es una fotografía, y es una malla, no un fondo

**Estado:** vigente · **Desde:** 2026-08; imágenes y exposición actuales confirmadas el 2026-10-20 · **Sustituye a:** DECISIONS §19

## Decisión

1. **El cielo es una esfera opaca vista desde dentro** (`SkyShell`): `BackSide`, `renderOrder` -1000, sin escritura de profundidad. Nunca es `scene.background`. Pasa por el composer y su shader termina en `colorspace_fragment`.
2. **Archivos:**
   - Un par AVIF/WebP en versión ancha y estrecha (`SPACE_CONFIG.sky` en `src/experiences/earth/scene/space/spaceConfig.ts`), elegido una vez por `narrowMaxWidth`. Si falla AVIF se usa WebP.
   - Las precargas de `index.html` deben coincidir con la variante elegida.
   - **Las imágenes publicadas en `public/textures/` son las buenas**, y la exposición actual (`skyBrightness`/`skyContrast`) es la correcta (confirmado el 2026-10-20). Miden 4096×2049 (y 2048×1025 la estrecha), así que no salieron de `prepare-sky-panorama.mjs`. Los antiguos problemas de costura y polos venían de las imágenes de origen elegidas, no del código.
3. **`sky:panorama` es obligatorio, pero si falla se marca como hecho:** el resultado es un cielo negro, no un arranque fatal.
4. **Aparece junto con la Tierra** (`backdropVisible` delega en `earthVisible`).
5. **Controles del shader:**
   - exposición: `skyBrightness`/`skyContrast` en `introConfig.ts`;
   - reparación de los casquetes polares: `skyCap*` y `cap*` en `spaceConfig.ts`;
   - grano y dither.
6. **Las estrellas son una capa aparte**, con garantía geométrica (`check:space`).
7. **El bloom va entre `RenderPass` y `AfterimagePass`.** Con fuerza 0 el pase se desactiva.
8. **No hay crédito de terceros en ningún sitio**, por requisito del cliente.
9. **Herramientas:**
   - `scripts/prepare-sky-panorama.mjs` prepara un cielo nuevo, y rechaza entradas que no sean 2:1;
   - `screen-sky-source.mjs` revisa una fuente y `preview-sky-poles.mjs` muestra los polos.
   - En builds de depuración: `?skyImage=` y `?sky=`.

## Por qué

- `scene.background` no pasa por tone mapping, y una malla no tapa nada.
- Los casquetes oscuros son naturales en la fuente.
- El cliente no quiere créditos visibles.

## Qué se descartó

`scene.background`, la nebulosa procedural, WebP como formato principal, el crédito de ESO, los Deep Star Maps de la NASA, animar el cielo y quitar las rayas solo en el shader.

## Ojo al leer el código

El comentario de exposición de `introConfig.ts` y el de `capLevel` en `spaceConfig.ts` hablan de otros archivos y otros valores. Manda el valor actual, no el comentario.

## Se ha roto si…

- `npm run check:space` falla (§2: garantía de la capa de estrellas; §7: el casquete no alcanza el encuadre de reposo).
- `e2e/backdrop.spec.ts` falla. Sus capturas de referencia son anteriores a varios cambios de encuadre y probablemente ya fallan.
- Falla `protoSky.test.ts`.

## Afecta a

`src/experiences/earth/scene/SkyShell.tsx`, `src/experiences/earth/scene/space/`, `src/experiences/earth/config/introConfig.ts`, `src/experiences/earth/config/protoSky.ts`, `src/graphics/RenderPipeline.tsx`, `index.html`, `public/textures/`, `scripts/prepare-sky-panorama.mjs`
