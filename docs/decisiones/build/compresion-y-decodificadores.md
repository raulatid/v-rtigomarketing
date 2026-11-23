# Geometría en Draco, texturas en KTX2, y los decodificadores son los de three

**Estado:** vigente · **Desde:** 2026-08-14 (`c5c90aa`: decodificadores servidos desde el sitio); la Tierra en KTX2 desde el 2026-09-06 (`2a34e5e`) · **Sustituye a:** la fila «The city loader needs only Draco» de «Superseded» de DECISIONS; ARCHITECTURE §19 en lo que toca a decodificadores; `archivo/murcia/blender-city-backdrop.md` §8 en lo que toca a meshopt y cuantización

## Decisión

1. **La geometría va en Draco** (`KHR_draco_mesh_compression`). La llevan todos los GLB de `public/models/`: la ciudad, el satélite, el isotipo y, desde el 2026-11-18, los vehículos. La ciudad mantiene además `EXT_mesh_gpu_instancing` (ver el [contrato de exportación](../../murcia/blender-export-contract.md), §6.2).
   - **El repositorio no procesa GLB:** ni `gltf-transform`, ni `gltfpack`, ni otra herramienta glTF en `package.json` o en el build. Los GLB llegan terminados y `checks/city-asset.ts` solo los lee.
   - **El post-proceso es del pipeline de entrega**, fuera del repositorio. El de la ciudad ya reescribía el GLB (`patch()` de `export.py`: nodos de instancias y `_LIGHTMAP_ST`). Desde la entrega v5.2-r2 (2026-11-17) también recodifica el Draco y quita los atributos que lo horneado no lee (ver [contrato del GLB](contrato-del-glb.md), §1).
   - **La condición es que el Draco lo decodifique el decodificador que servimos.** Por eso la recodificación usa `draco_encoder.js` de la misma versión de three, sin dependencias nuevas. Cada primitiva se vuelve a decodificar y se compara triángulo a triángulo con la original antes de escribir el archivo.
   - **La cuantización la decide la entrega, por primitiva y con tolerancia medida.** En la ciudad, hasta r4 era la de la exportación (posición 18, normal 12, UV 16). Desde r5 son los bits justos para un paso de posición de 4,8 mm, el más grueso que ya tenía r4, y un error de UV de lightmap de 1/16 de téxel a 1024. Las primitivas que comparten vértices con otra y las que no van horneadas se quedan en 18/16 para no abrir juntas. Los satélites, el isotipo y los vehículos llevan su propia cuantización (ver el [registro de r5](../../murcia/lightmaps-v5.2-r5-integration.md) y `04_Assets/optimizados/recodificacion-2026-11-18/`). Desde el 2026-11-23 el satélite además se simplifica y se fusiona en una primitiva (`04_Assets/optimizados/recodificacion-2026-11-23/`, con el simplificador de meshoptimizer copiado en su `lib/`, fuera del repositorio).
2. **Las texturas que suben a la GPU desde un archivo propio van en KTX2/Basis:** los lightmaps de la ciudad, los mapas de la Tierra y la textura del satélite. El formato (ETC1S o UASTC, con o sin mips) lo decide quien codifica cada archivo; se lee en su cabecera. El cielo y los medios replicados no van en KTX2 (ver [cielo](../earth/cielo.md) y [medios replicados](../contenido/medios-replicados.md)). **Excepción desde el 2026-11-23:** el día y la noche de la Tierra en escritorio van en AVIF, con el KTX2 como respaldo; la tableta y el móvil siguen en KTX2 (ver [convenciones de render](../earth/convenciones-de-render.md), §5).
3. **Los decodificadores se sirven desde el propio sitio y son copias exactas de los de la versión de three instalada:**
   - `public/draco/` = `three/examples/jsm/libs/draco/gltf`, sin `draco_encoder.js`;
   - `public/libs/basis/` = `three/examples/jsm/libs/basis`.

   Al actualizar three se vuelven a copiar. Las rutas (`DRACO_PATH`, `BASIS_PATH`) y el ciclo de vida de los cargadores son de [decodificadores compartidos](../render/decodificadores-compartidos.md).
4. **El cargador de la ciudad lleva KTX2 aunque el GLB no traiga imágenes Basis** (`createAssetLoader.ts`): un GLTFLoader sin KTX2Loader rechaza la carga entera en cuanto aparece una.
5. **El transcodificador obliga a `'unsafe-eval'` en la CSP** (ver [cabeceras y CSP](../privacidad/cabeceras-y-csp.md)).
6. **Todo KTX2 publicado es Basis (vkFormat 0), y el build no lleva el decodificador Zstd de three** (desde el 2026-11-18). `KTX2Loader` solo lo usa para un formato crudo con Zstd; los Basis, UASTC con Zstd incluido, los descomprime el transcodificador. `threeWithoutZstd` (`vite.config.ts`) lo cambia por un stub que falla con un mensaje claro, y quita unos 40 KB del chunk de three. El build falla si `KTX2Loader` deja de importar ese módulo, y la higiene de publicación rechaza un KTX2 crudo con Zstd (`assetMetadata`).

## Por qué

- Draco y KTX2 bajan los bytes por la red, y KTX2 además se queda comprimido en la GPU, donde la memoria de iOS es el límite (comentario de `createAssetLoader.ts`).
- El Draco que escribe Blender 5.1 a nivel 6 ocupaba casi el doble que el del codificador de three con la misma cuantización. En v5.2-r1 eran 7,28 MB frente a 4,05 MB, con los mismos triángulos. Quitando además los atributos muertos quedó en 2,24 MB, y el GLB pasó de 8,73 a 3,67 MB. Vercel sirve el GLB con Brotli, pero Brotli apenas reduce el Draco, así que el ahorro llega a la red. Decodificar también es más rápido: unos 330 ms frente a 680 ms en Node.
- Mantener las herramientas glTF fuera del repositorio conserva lo que motivó la regla original (`archivo/murcia/blender-city-backdrop.md` §8): no añadir dependencias al build.
- Los decodificadores tienen que corresponder a la versión de three que los carga; por eso se copian de su paquete y se mantienen al día con él (comentario de `decoders.ts`).
- Con KTX2 en el cargador de la ciudad, un GLB con imágenes Basis es un cambio de archivo y no un fallo fatal (comentario de `createAssetLoader.ts`).

## Qué se descartó

- **`KHR_mesh_quantization`:** three lo lee sin decodificador, pero Blender no lo emite (`archivo/murcia/blender-city-backdrop.md` §8). Con la geometría ya cuantizada dentro de Draco no aporta nada.
- **«La geometría tal como la escribe el exportador de Blender, sin post-proceso glTF»** (redacción hasta el 2026-11-17). Ya no era cierta, porque `patch()` reescribía el GLB, y dejaba fuera la recodificación (decisión del usuario, 2026-11-17).
- **Quitar `TEXCOORD_0` de lo horneado:** glTF exige índices consecutivos desde 0. Habría que mover la UV de lightmap a `TEXCOORD_0` y cambiar `uvChannel` en el manifiesto, el runtime y los checks. Colapsado, Draco lo reduce a casi nada.
- **`EXT_meshopt_compression`:** además obligaría a publicar y registrar otro decodificador. Bytes nuevos sin justificación (mismo documento).
- **Un cargador de la ciudad solo con Draco.**
- **El decodificador Draco genérico:** es más grande e incluye un codificador que nada usa (comentario de `decoders.ts`).

## Se ha roto si…

- Falla el build con `[vertigo-three-without-zstd]` tras actualizar three, o la publicación con `raw vkFormat and Zstd`. Fija: `publicationHygiene.test.ts` («refuses a raw-format Zstd KTX2…»).
- `public/draco/` o `public/libs/basis/` difieren de los de three tras una actualización. **Ningún test lo vigila:** compáralos con `cmp` contra `node_modules/three/examples/jsm/libs/`.
- Un GLB con imágenes `KHR_texture_basisu` hace fallar la carga de la ciudad.
- Con la CSP aplicada, el arranque termina en fatal (el transcodificador no puede compilar).
- Un decodificador da 404 fuera de `/`.

## Afecta a

`public/draco/`, `public/libs/basis/`, `public/models/`, `public/earth/`, `public/textures/`, `src/graphics/decoders.ts`, `src/experiences/murcia/assets/createAssetLoader.ts`, `vite.config.ts` (`threeWithoutZstd`), `scripts/publicationHygiene.ts`, `vercel.json` (CSP, `Content-Type` de `.wasm`)
