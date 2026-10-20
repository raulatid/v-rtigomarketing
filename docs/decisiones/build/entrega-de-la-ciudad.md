# La ciudad es una entrega versionada: un GLB y su carpeta de lightmaps

**Estado:** vigente · **Desde:** 2026-09-15 (`3becc4d`: un solo manifiesto, `unifiedManifest.ts`); perfiles mixtos por atlas desde el 2026-09-25 (`745b08b`); entrega y topes actuales desde el 2026-09-25 (`21fce78`, `03fd9d8`); topes con nombre desde el 2026-10-20 (`b9b2120`) · **Sustituye a:** DECISIONS §49 en lo que toca a archivos, coste y resolución («Resolution follows the sky's split», «Cost»); `docs/murcia/lightmaps-*-integration.md` y `archivo/murcia/stadium-roof-repair.md` como fuente vigente

## Decisión

1. **Una entrega son dos piezas con la misma versión en el nombre:** el GLB en `public/models/` y una carpeta `public/textures/murcia/lightmaps-<versión>/` con un solo `lightmaps.json` y sus KTX2. Se instalan y se retiran juntas. Las nombra `murciaConfig` (`modelPath`, `lightmaps.baseUrl`, `lightmaps.manifest`); `checks/city-asset.ts` lee el nombre del GLB (ver [contrato del GLB](contrato-del-glb.md)).
2. **`lightmaps.json` es el contrato entre el horneado y el runtime.** `parseUnifiedManifest` (`unifiedManifest.ts`) lo valida antes de reservar nada en la GPU:
   - `uvChannel` igual a 1;
   - `requiredNames`, los nodos que tienen que existir en el GLB;
   - por atlas, una intensidad y dos variantes, 1024 y 2048, cada una con un archivo dentro de la carpeta, sus bytes y su número de mips (el máximo por resolución lo fija `parseUnifiedManifest` en `unifiedManifest.ts`);
   - `profiles`, opcional: la resolución de cada atlas en móvil y en escritorio.

   Un rehorneado se instala soltando archivos: el runtime no guarda una segunda lista de atlas.
3. **Los receptores los marca el GLB, no el código:** cada nodo horneado lleva `extras.lightmap_atlas` con la clave de su atlas (ver el [contrato de exportación](../../murcia/blender-export-contract.md), §7).
4. **Qué baja cada dispositivo.** `deviceResolution` da la base: 1024 con pantalla estrecha, puntero grueso, pantalla táctil o poca memoria; 2048 en lo demás. La base elige el perfil del manifiesto (`profiles.mobile` o `profiles.desktop`), que fija atlas concretos a otra resolución. `murciaConfig.lightmaps.desktop1024` baja atlas por clave, y una clave que el manifiesto no tiene lanza error.
5. **El tope de descarga es por perfil y sobre el total, no por archivo:** `LIGHTMAP_BUDGET_BYTES` en `unifiedManifest.ts`. Un manifiesto que lo supera no se aplica. Los valores actuales están aprobados (decisión del usuario, 2026-10-20).
6. **`unifiedManifest.test.ts` lee la entrega publicada** y comprueba cada KTX2 (firma, dimensiones, mips y bytes contra el manifiesto). También fija el total exacto de cada perfil. Una recodificación cambia ese test en el mismo commit.
7. **El formato de cada atlas lo decide la entrega:** ETC1S por defecto, y UASTC con Zstd en algunos atlas de detalle. Se ve en la cabecera de cada KTX2; el runtime no lo distingue (ver [compresión y decodificadores](compresion-y-decodificadores.md)).
8. **Los bytes se leen durante la apertura y la ciudad se construye en `site`.** `cityBytes.ts` elige los mismos atlas que `loadUnifiedLightmaps` (ver [precarga de Murcia](../transicion/precarga-de-murcia.md)).
9. **Un fallo de lightmaps no es fatal:** `loadUnifiedLightmaps` avisa `[lightmaps] not applied` y la ciudad queda con su material sin hornear.

**Frontera:** cómo se pintan los receptores (material sin luz, `preserveAlbedo`, límite de mips, el vidrio que conserva PBR) es del área de render. Hasta que se migre, la fuente es DECISIONS §49.

## Por qué

- `public/` no lleva hash y se cachea: si una entrega cambia sin cambiar de nombre, el visitante puede mezclar un GLB nuevo con atlas viejos (ver [recursos publicados](recursos-publicados.md)).
- Un solo manifiesto convierte un rehorneado en soltar archivos, sin tocar código.
- Los perfiles mixtos dan prioridad al suelo central, la catedral y los pretiles de las azoteas; el contexto exterior se queda más pequeño (comentario de `lightmaps` en `murciaConfig.ts`, `745b08b`).
- La base en 1024 para pantallas táctiles y con poca memoria existe porque los atlas se quedan en la GPU desde la intro y la memoria de iOS es el límite (comentario de `chooseLightmapResolution`, `bba196a`).

## Qué se descartó

- **Un presupuesto de bytes, triángulos o draw calls para el GLB.** El GLB va a cambiar y no es un recurso estable; un presupuesto ahora no tiene sentido (decisión del usuario, 2026-10-20).
- **Dos manifiestos con chunks fijos por cuadrante** (`assets-lightmaps.json`, `ground-lightmaps.json`), el formato de murcia-v7.
- **Una sola resolución por dispositivo**, todo 1024 en móvil: sustituida por perfiles mixtos.
- **Topes por archivo.**
- **Conservar las entregas anteriores en `public/` para volver atrás** (lo hacía `3becc4d`).

## Se ha roto si…

- Falla `src/experiences/murcia/assets/lightmaps/unifiedManifest.test.ts` (bytes, cabeceras, totales exactos o tope por perfil).
- Falla `loadUnifiedLightmaps.test.ts`.
- Al cargar la ciudad aparece en la consola `[lightmaps] not applied`, con uno de estos motivos:
  - `exceeds the total download budget`;
  - `missing runtime node`;
  - `missing uv1`;
  - `unknown atlas`;
  - `missing ST` o `instance count mismatch`;
  - `dynamic surface was baked`;
  - `no atlas to reduce`.

  Ningún test ni e2e lo convierte en fallo.
- Falla `npm run check:asset:contract`.

## Afecta a

`src/experiences/murcia/config/murciaConfig.ts` (`modelPath`, `lightmaps`), `src/experiences/murcia/config/environmentConfig.ts` (`LightmapConfig`), `src/experiences/murcia/assets/lightmaps/` (`unifiedManifest.ts`, `loadUnifiedLightmaps.ts`, `loadLightmaps.ts`, `deviceResolution.ts`, `lightmapManifest.ts`), `src/experiences/murcia/assets/cityBytes.ts`, `public/models/`, `public/textures/murcia/lightmaps-*/`, `checks/city-asset.ts`, `docs/murcia/lightmaps-v5.2-r1-integration.md` (registro de la entrega vigente)
