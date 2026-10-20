# El GLB de la ciudad se comprueba leyendo su JSON, y el build exige la parte de nombres

**Estado:** vigente · **Desde:** 2026-08-14 (`c5c90aa`, `checks/city-asset.ts`); contrato de nombres desde el 2026-08-28 (`867c5b5`); `check:asset:contract` en la cadena desde el 2026-08-31 (`950edce`) · **Sustituye a:** DECISIONS §49 «Also broken when», en lo que debe llevar el archivo

## Decisión

1. **`checks/city-asset.ts` lee el bloque JSON del GLB**, sin GLTFLoader y sin decodificar Draco. Por defecto lee `public` + `murciaConfig.modelPath`; acepta otra ruta para revisar una entrega antes de instalarla.
2. **`npm run check:asset:contract` está en `check:harnesses` y para el build.** Comprueba lo que, roto, da una ciudad que carga pero no funciona:
   - §3: `EXT_mesh_gpu_instancing` sigue aplicado;
   - §4: no hay luces exportadas;
   - §5: los nodos del campus (`CAMPUS_BAKED_NODE_NAMES` si el GLB trae `lightmap_atlas`, si no `CAMPUS_NODE_NAMES`), el canal UV de su pantalla (`CAMPUS_SCREEN_UV_CHANNEL`) y que el campus está sobre la placa;
   - §5b: los nodos del blog (`BLOG_BUILDING_NODE_NAMES`; ver [entrada por la pantalla](../blog/entrada-por-la-pantalla.md));
   - §5d: la torre (`VERTIGO_BUILDING`): logos sin rotación ni escala, y la pantalla con su `screenUvChannel`;
   - §7: la placa (`terrainTransition.terrainObjectName`); hoy no hay suelo exterior aparte (`groundObjectName: null`);
   - §7b: el anillo construido cubre `CITY_A2` y el rectángulo navegable (ver [límites de la cámara](../murcia/limites-de-camara.md));
   - el techo del estadio y el Teatro Romea donde los dejó el autor, sin clips de animación.
3. **`npm run check:asset` (completo) añade:**
   - §1: `TEXCOORD_0` en todas las primitivas y `TEXCOORD_1` en cada receptor horneado;
   - §2: topes de materiales e imágenes (`MATERIAL_CEILING`, `IMAGE_CEILING`) y oclusión en `TEXCOORD_0`;
   - §6: informe de samplers, sin aserción.

   Pasa entero sobre el GLB vigente (ejecutado el 2026-10-20), pero **no se encadena hasta que el GLB nuevo sea estable** (decisión del usuario, 2026-10-20). Mientras, la diferencia entre los dos checks es un hueco conocido: ejecútalo a mano con cada GLB nuevo.
4. **Los nombres se comparan como los resuelve el runtime:** literal o tras `PropertyBinding.sanitizeNodeName`, que se importa de three, no se copia. El harness no acepta `extras.runtime_name`; el runtime sí (`nodeNames.ts`). El nombre del nodo es el contrato.
5. **Las cotas se miden en mundo:** `worldBounds` compone toda la cadena de transformaciones de los padres.
6. **Una aserción se retira con el mismo cuidado con que se añade.** Un harness que sigue en rojo por una regla muerta enseña a ignorarlo.

## Por qué

Una regresión de exportación no es un fallo, sino una ciudad más callada: un edificio que deja de responder, una pantalla oscura, un material que no muestrea nada. Todo parece un sitio que funciona. Leer el archivo, y no lo que GLTFLoader hace con él, evita que los valores por defecto del cargador tapen lo que falta (cabecera de `checks/city-asset.ts`). El caso que lo originó: la placa se buscaba por un nombre que el exportador había reescrito, y el área navegable se encogió sin aviso a una fracción de la placa.

## Qué se descartó

- Cargar el GLB con GLTFLoader en el harness.
- Encadenar ya el `check:asset` completo: el GLB va a cambiar.
- Asertar `extras.district` y los distritos de servicios (retirados el 2026-08-27, el 2026-09-06 y el 2026-09-11).
- Medir el anillo sobre el suelo y no sobre lo construido.

## Se ha roto si…

- Falla `npm run check:asset:contract` en alguna de sus secciones (3, 4, 5, 5b, 5d, 7, 7b, el techo).
- Falla `npm run check:asset` en §1 o §2 con un GLB nuevo. No para el build.
- Al cargar, un nodo con nombre falta (la torre, el campus o el blog se quedan quietos u oscuros) o aparece `[lightmaps] missing runtime node`.

## Afecta a

`checks/city-asset.ts`, `package.json` (`check:asset`, `check:asset:contract`, `check:harnesses`), `src/experiences/murcia/config/murciaConfig.ts`, `src/experiences/murcia/campus/campusConfig.ts`, `src/experiences/murcia/blogDisplay/blogDisplayConfig.ts`, `src/experiences/murcia/landmark/vertigoBuildingConfig.ts`, `src/experiences/murcia/assets/nodeNames.ts`, `docs/murcia/blender-export-contract.md`
