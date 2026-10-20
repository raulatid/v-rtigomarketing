# Un decodificador de cada tipo, contado y devuelto al terminar la carga

**Estado:** vigente · **Desde:** 2026-08-14 (`c5c90aa`; [auditoría de iOS Safari](../../audits/reports/ios-safari-2026-08-14.md), I6); liberación al terminar la carga desde el 2026-09-05 (`8e40377`) · **Sustituye a:** DECISIONS §24 y la fila «Each consumer builds its own Draco/KTX2 loader» de «Superseded»

## Decisión

1. **`graphics/decoders.ts` es dueño del único `DRACOLoader` y del único `KTX2Loader` de la aplicación.** Cada consumidor llama a `acquire…` y `release…` por parejas; el último en soltar libera el grupo de workers. Cada consumidor sigue teniendo su propio `GLTFLoader`.
2. **Se suelta cuando termina la carga, también si falla**, no cuando se libera el objeto que cargó. El logo de esquina y Murcia viven toda la sesión: atar la referencia a su vida dejaba los workers residentes para siempre.
3. **Los límites de workers son los de three.** Bajarlos es una cuestión de perfil de dispositivo que no se ha medido.
4. **Las rutas de los decodificadores las fija este módulo** (`DRACO_PATH`, `BASIS_PATH`), absolutas desde la raíz para que no fallen fuera de `/`.

## Por qué

Tres consumidores (ciudad, logo, satélites) creaban sus propios cargadores contra los mismos archivos: varios grupos de workers con su WASM duplicado, todos vivos a la vez durante la intro, en la plataforma que cierra pestañas por memoria (cifras en el comentario de `decoders.ts`). Un singleton arregla el pico pero deja dos grupos de workers residentes toda la sesión; el contador conserva ambas propiedades: como mucho un grupo de cada tipo, y ninguno cuando nadie decodifica.

## Qué cuesta

Murcia vuelve a crear un grupo de Draco después de la apertura; los archivos se sirven de caché (`8e40377`).

## Qué se descartó

- Un cargador por consumidor.
- Un singleton para toda la sesión.
- Soltar en el `dispose` del consumidor (el diseño original de §24).

## Se ha roto si…

- Aparece `new DRACOLoader` o `new KTX2Loader` fuera de `graphics/decoders.ts`, o el aviso de three de «multiple instances» en la consola: **sin check**, solo revisión.
- Siguen vivos workers de Draco o Basis después de que la ciudad esté lista (medición manual de `8e40377`, sin test).
- Falla `loadUnifiedLightmaps.test.ts` (el transcodificador se suelta una sola vez, también si falla la descarga).

## Afecta a

`src/graphics/decoders.ts`, `src/corner-logo/loadLogoAssets.ts`, `src/experiences/murcia/MurciaExperience.ts` (`releaseDecoders`), `src/experiences/murcia/assets/createAssetLoader.ts`, `src/experiences/murcia/assets/lightmaps/loadLightmaps.ts`, `src/experiences/murcia/assets/lightmaps/loadUnifiedLightmaps.ts`, `src/experiences/earth/orbit/createSatellite.ts`, `src/experiences/earth/scene/EarthScene.tsx`
