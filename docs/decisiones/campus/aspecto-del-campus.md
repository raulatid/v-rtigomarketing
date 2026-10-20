# El lago lleva el agua del río, y el edificio su luz horneada

**Estado:** vigente · **Desde:** 2026-09-11 (`346035b`); campus horneado desde el 2026-09-15 (`3becc4d`); agua del río desde el 2026-09-22 (`17d44ab`) · **Sustituye a:** DECISIONS §45 (en parte: «Authored metalness is kept»)

## Decisión

1. **El agua del campus es la del río** (`createRioWater`, a través de `lake/lakeWater.ts`), con los colores del lago (`water` en `attachServicesCampus.ts`). Se pone en todas las mallas del nodo de agua, lago y piscinas, y al liberarse devuelve las originales. No hay orillas ni sombra de muro: el lago entero se ve como mitad de cauce.
2. **En la exportación horneada actual,** las piezas del campus llevan `lightmap_atlas` y conservan su color de vértice y su luz horneada, y `applyCampusPalette` (`campusPalette.ts`) las salta. La tira y el agua no se hornean (`runtime_material`).
3. **`CAMPUS_PALETTE` sirve para una exportación sin hornear:** viste cada pieza por su nombre con los valores del laboratorio, metalicidad incluida, y sustituye el material en vez de modificarlo. Se aplica en `loadCity`, después de `applyTrimSheet` y del agua del río.
4. **Los árboles del parque** (`CAMPUS_INSTANCED_TREE_NAMES`) son vegetación instanciada de la ciudad; con el campus horneado no se exigen.
5. **Hover y parpadeo:** [edificios interactivos](../murcia/edificios-interactivos.md).

## Por qué

- El lago tenía su propio shader y se leía como un agua distinta de la del río (`17d44ab`).
- Sin orillas porque el shader admite pocos segmentos de orilla y el contorno del nodo de agua tiene muchos más, repartidos en tres cuerpos (`lakeWater.ts`).
- La paleta sustituye el material porque el que desplaza lo comparten todos los edificios de la ciudad (`campusPalette.ts`).
- La metalicidad del laboratorio se juzgó bajo un rig de luces del mismo tipo (§45, `campusPalette.ts`).
- Saltar lo horneado: ver el [contrato de exportación](../../murcia/blender-export-contract.md), párrafo «In the current, baked export…».

## Qué se descartó

- El shader propio del lago (olas, cáusticas y destello), retirado en `17d44ab`.
- Poner los metales a cero, como hizo la paleta de la torre.

## Se ha roto si…

- Falla `lake/lakeWater.test.ts`.
- Falla `campusPalette.test.ts`. Solo cubre la exportación sin hornear: que se salten las piezas horneadas no tiene test.
- `npm run check:asset:contract` §5 no encuentra los nodos (`CAMPUS_BAKED_NODE_NAMES` o `CAMPUS_NODE_NAMES`); ver [contrato del GLB](../build/contrato-del-glb.md).

## Afecta a

`src/experiences/murcia/campus/lake/lakeWater.ts`, `src/experiences/murcia/campus/lake/lakeBasin.ts`, `src/experiences/murcia/campus/campusPalette.ts`, `src/experiences/murcia/campus/campusConfig.ts`, `src/experiences/murcia/campus/attachServicesCampus.ts`, `src/experiences/murcia/water/createRioWater.ts`, `src/experiences/murcia/assets/loadCity.ts`
