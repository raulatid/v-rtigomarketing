# Geometría en Draco, texturas en KTX2, y los decodificadores son los de three

**Estado:** vigente · **Desde:** 2026-08-14 (`c5c90aa`: decodificadores servidos desde el sitio); la Tierra en KTX2 desde el 2026-09-06 (`2a34e5e`) · **Sustituye a:** la fila «The city loader needs only Draco» de «Superseded» de DECISIONS; ARCHITECTURE §19 en lo que toca a decodificadores; `archivo/murcia/blender-city-backdrop.md` §8 en lo que toca a meshopt y cuantización

## Decisión

1. **La geometría va en Draco** (`KHR_draco_mesh_compression`), tal como la escribe el exportador de Blender. Los tres GLB de `public/models/` la llevan. No hay post-proceso glTF en el proyecto. La ciudad mantiene además `EXT_mesh_gpu_instancing` (ver el [contrato de exportación](../../murcia/blender-export-contract.md), §6.2).
2. **Las texturas que suben a la GPU desde un archivo propio van en KTX2/Basis:** los lightmaps de la ciudad, los mapas de la Tierra y la textura del satélite. El formato (ETC1S o UASTC, con o sin mips) lo decide quien codifica cada archivo; se lee en su cabecera. El cielo y los medios replicados no van en KTX2 (ver [cielo](../earth/cielo.md) y [medios replicados](../contenido/medios-replicados.md)).
3. **Los decodificadores se sirven desde el propio sitio y son copias exactas de los de la versión de three instalada:**
   - `public/draco/` = `three/examples/jsm/libs/draco/gltf`, sin `draco_encoder.js`;
   - `public/libs/basis/` = `three/examples/jsm/libs/basis`.

   Al actualizar three se vuelven a copiar. Las rutas (`DRACO_PATH`, `BASIS_PATH`) y el ciclo de vida de los cargadores son de [decodificadores compartidos](../render/decodificadores-compartidos.md).
4. **El cargador de la ciudad lleva KTX2 aunque el GLB no traiga imágenes Basis** (`createAssetLoader.ts`): un GLTFLoader sin KTX2Loader rechaza la carga entera en cuanto aparece una.
5. **El transcodificador obliga a `'unsafe-eval'` en la CSP** (ver [cabeceras y CSP](../privacidad/cabeceras-y-csp.md)).

## Por qué

- Draco y KTX2 bajan los bytes por la red, y KTX2 además se queda comprimido en la GPU, donde la memoria de iOS es el límite (comentario de `createAssetLoader.ts`).
- Los decodificadores tienen que corresponder a la versión de three que los carga; por eso se copian de su paquete y se mantienen al día con él (comentario de `decoders.ts`).
- Con KTX2 en el cargador de la ciudad, un GLB con imágenes Basis es un cambio de archivo y no un fallo fatal (comentario de `createAssetLoader.ts`).

## Qué se descartó

- **`KHR_mesh_quantization`:** three lo lee sin decodificador, pero Blender no lo emite y exigiría añadir herramientas de post-proceso glTF al build (`archivo/murcia/blender-city-backdrop.md` §8).
- **`EXT_meshopt_compression`:** además obligaría a publicar y registrar otro decodificador. Bytes nuevos sin justificación (mismo documento).
- **Un cargador de la ciudad solo con Draco.**
- **El decodificador Draco genérico:** es más grande e incluye un codificador que nada usa (comentario de `decoders.ts`).

## Se ha roto si…

- `public/draco/` o `public/libs/basis/` difieren de los de three tras una actualización. **Ningún test lo vigila:** compáralos con `cmp` contra `node_modules/three/examples/jsm/libs/`.
- Un GLB con imágenes `KHR_texture_basisu` hace fallar la carga de la ciudad.
- Con la CSP aplicada, el arranque termina en fatal (el transcodificador no puede compilar).
- Un decodificador da 404 fuera de `/`.

## Afecta a

`public/draco/`, `public/libs/basis/`, `public/models/`, `public/earth/`, `public/textures/`, `src/graphics/decoders.ts`, `src/experiences/murcia/assets/createAssetLoader.ts`, `vercel.json` (CSP, `Content-Type` de `.wasm`)
