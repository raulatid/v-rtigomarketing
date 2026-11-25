# La ciudad es una entrega versionada: un GLB y su carpeta de lightmaps

**Estado:** vigente · **Desde:** 2026-09-15 (`3becc4d`: un solo manifiesto, `unifiedManifest.ts`); perfiles mixtos por atlas desde el 2026-09-25 (`745b08b`); todo a 1024 en los dos perfiles desde el 2026-11-18 (v5.2-r4); GLB recuantizado desde el 2026-11-18 (v5.2-r5); entrega v8 sin variantes de 2048 desde el 2026-11-20 (`3df184f`); entrega v9, con ventanas y pretiles de tejado que heredan la luz, desde el 2026-11-23 (`9782348`); el perfil móvil a 512 en todos los atlas desde el 2026-11-24; entrega y topes actuales desde el 2026-09-25 (`21fce78`, `03fd9d8`); topes con nombre desde el 2026-10-20 (`b9b2120`) · **Sustituye a:** DECISIONS §49 en lo que toca a archivos, coste y resolución («Resolution follows the sky's split», «Cost»); `docs/murcia/lightmaps-*-integration.md` y `archivo/murcia/stadium-roof-repair.md` como fuente vigente

## Decisión

1. **Una entrega son dos piezas con la misma versión en el nombre:** el GLB en `public/models/` y una carpeta `public/textures/murcia/lightmaps-<versión>/` con un solo `lightmaps.json` y sus KTX2. Se instalan y se retiran juntas. Las nombra `murciaConfig` (`modelPath`, `lightmaps.baseUrl`, `lightmaps.manifest`); `checks/city-asset.ts` lee el nombre del GLB (ver [contrato del GLB](contrato-del-glb.md)).
2. **`lightmaps.json` es el contrato entre el horneado y el runtime.** `parseUnifiedManifest` (`unifiedManifest.ts`) lo valida antes de reservar nada en la GPU:
   - `uvChannel` igual a 1;
   - `requiredNames`, los nodos que tienen que existir en el GLB;
   - por atlas, una intensidad y sus variantes: la de 1024 es obligatoria; las de 512 y 2048, opcionales. Cada una lleva un archivo dentro de la carpeta, sus bytes y su número de mips (el máximo por resolución lo fija `parseUnifiedManifest` en `unifiedManifest.ts`). Un atlas sin 2048 se carga a 1024 en cualquier dispositivo. La de 512 solo se carga donde un perfil la nombra;
   - `profiles`, opcional: la resolución de cada atlas en móvil y en escritorio (512, 1024 o 2048).

   Un rehorneado se instala soltando archivos: el runtime no guarda una segunda lista de atlas.
3. **Los receptores los marca el GLB, no el código:** cada nodo horneado lleva `extras.lightmap_atlas` con la clave de su atlas (ver el [contrato de exportación](../../murcia/blender-export-contract.md), §7).
   **Las ventanas y los pretiles de tejado no tienen luz propia (desde v9).** Llevan `extras.light_inheritance` y ninguna celda de atlas. Cuando `loadUnifiedLightmaps` ya ha iluminado las paredes y los tejados, `inheritLight.ts` sustituye cada uno por mallas que leen los téxeles de su soporte, con un factor de sombra por tipo de cara (`lightInheritance.ts`). Siguen en el horneado como bloqueadores: las paredes se hornean con la sombra de la ventana, que tapa el alféizar. Una ventana o cara sin soporte al alcance lee el soporte más cercano en 5 m; en v9 son 1 ventana de 19.129 y 9 caras de pretil de 12.856. Sus consultas (`inheritanceSolve.ts`) cuestan unos 0,4 s y van en un worker (`inheritanceWorker.ts`); en el hilo principal quedan leer la escena y montar las mallas, unos 50 ms cada cosa en escritorio (2026-11-25).
4. **Qué baja cada dispositivo.** `deviceResolution` da la base: 1024 con pantalla estrecha, puntero grueso, pantalla táctil o poca memoria; 2048 en lo demás. La base elige el perfil del manifiesto (`profiles.mobile` o `profiles.desktop`), que fija atlas concretos a otra resolución. Hoy `profiles.mobile` pone los 15 atlas a 512 y `profiles.desktop`, a 1024. `murciaConfig.lightmaps.desktop1024` baja atlas por clave a 1024 como máximo (no sube uno que el perfil ya tiene a 512), y una clave que el manifiesto no tiene lanza error.
5. **El tope de descarga es por perfil y sobre el total, no por archivo:** `LIGHTMAP_BUDGET_BYTES` en `unifiedManifest.ts`. Un manifiesto que lo supera no se aplica. Los valores actuales están aprobados (decisión del usuario, 2026-10-20).
6. **`unifiedManifest.test.ts` lee la entrega publicada** y comprueba cada KTX2 (firma, dimensiones, mips y bytes contra el manifiesto). También fija el total exacto de cada perfil. Una recodificación cambia ese test en el mismo commit.
7. **El formato de cada atlas lo decide la entrega:** ETC1S por defecto; UASTC con Zstd es posible en atlas de detalle, aunque desde r4 ninguno lo usa. Se ve en la cabecera de cada KTX2; el runtime no lo distingue (ver [compresión y decodificadores](compresion-y-decodificadores.md)).
8. **Los bytes se leen durante la apertura y la ciudad se construye en `site`.** `cityBytes.ts` elige los mismos atlas que `loadUnifiedLightmaps` (ver [precarga de Murcia](../transicion/precarga-de-murcia.md)).
9. **Un fallo de lightmaps no es fatal:** `loadUnifiedLightmaps` avisa `[lightmaps] not applied` y la ciudad queda con su material sin hornear.

**Frontera:** cómo se pintan los receptores (material sin luz, `preserveAlbedo`, límite de mips, el vidrio que conserva PBR) es del área de render. Hasta que se migre, la fuente es DECISIONS §49.

## Por qué

- `public/` no lleva hash y se cachea: si una entrega cambia sin cambiar de nombre, el visitante puede mezclar un GLB nuevo con atlas viejos (ver [recursos publicados](recursos-publicados.md)).
- Un solo manifiesto convierte un rehorneado en soltar archivos, sin tocar código.
- Desde r4 los dos perfiles cargan todos los atlas a 1024 (1.837.076 bytes). Con el prototipo de 2026-11-18 el usuario no vio diferencia frente a 2048 en la escena, en escritorio ni en móvil emulado, ni en el acercamiento máximo. Antes, los perfiles mixtos daban prioridad al suelo central, la catedral y los pretiles (`745b08b`). Hasta r5 las variantes de 2048 seguían en la entrega porque `parseUnifiedManifest` exigía las dos, aunque ningún perfil las descargaba. Desde v8 son opcionales y la entrega ya no las trae.
- **Desde el 2026-11-24 el móvil carga los 15 atlas a 512** (526.216 bytes frente a 1.458.128; −0,93 MB en la visita del móvil). El usuario lo comparó en un prototipo, en escritorio y en móvil emulado, con tres repartos (solo el anillo exterior, todo menos los hitos y todo) y eligió todo: en el móvil no se nota. Los 512 salen del máster PNG de 1024 reducido a la mitad por `toktx`, con el mismo `qlevel` ETC1S y un solo mip; no se rehornean ni se redilatan (paso 5b de la cadena, `compress512.py` en `murcia-v9-r2`, fuera del repositorio). En el atlas quedan entre 23 y 32 dB frente al máster reducido; los peores son `outer-buildings` (23,1) y `outer-ring-b` (25,9), cuyas caras finas miden menos de un téxel a 512. El escritorio sigue a 1024. Además, a 512 cada atlas ocupa la cuarta parte de memoria de GPU, que es el límite de iOS. El perfil móvil lo cogen también las tabletas y los portátiles táctiles (`chooseLightmapResolution`).
- En r5 el GLB pesaba 2.615.876 bytes (3.673.964 en r4): Draco con los bits justos por primitiva e instancias en enteros normalizados, con los mismos lightmaps. La receta, sus tolerancias y la revisión en escena están en el [registro de r5](../../murcia/lightmaps-v5.2-r5-integration.md).
- En v9 el GLB pesa 1.938.156 bytes y los lightmaps, 1.458.128 en 15 atlas (v8: 1.983.652 y 2.052.451 en 20). Son los de la segunda pasada (2026-11-24, `murcia-v9-r2`), sobre `murcia-v5.9-calle-campus.blend`, con los props de tejado nuevos; la primera, sobre la fuente de v8, daba 1.938.604 y 1.460.576. La herencia de luz quita cinco atlas: las instancias que no son ventanas caben en uno solo (`instances-main-0`), y desaparecen `instances-main-1/2`, `instances-outer-0/1` y `rooftop-parapets`. A cambio, el marco blanco de las ventanas sale más apagado que con su propio horneado (plan 031). El usuario lo aceptó por el peso el 2026-11-22. La cadena está en `murcia-v9`, fuera del repositorio, con su `LEEME.md`.
- En v8 el GLB pesa 1.983.652 bytes y los lightmaps que se cargan, 2.052.451 en los dos perfiles. Las ventanas viajan como registros de fachada que `facadeRecords.ts` expande, y los props instanciados llevan una máscara de tono con un color por instancia. Cómo se exporta y qué falla está en el [análisis de la cadena de v8](../../audits/reports/murcia-v8-export-pipeline-2026-11-20.md), con cifras de la pasada anterior al arreglo de las ventanas.
- La base en 1024 para pantallas táctiles y con poca memoria existe porque los atlas se quedan en la GPU desde la intro y la memoria de iOS es el límite (comentario de `chooseLightmapResolution`, `bba196a`).

## Qué se descartó

- **Un presupuesto de bytes, triángulos o draw calls para el GLB.** El GLB va a cambiar y no es un recurso estable; un presupuesto ahora no tiene sentido (decisión del usuario, 2026-10-20).
- **Dos manifiestos con chunks fijos por cuadrante** (`assets-lightmaps.json`, `ground-lightmaps.json`), el formato de murcia-v7.
- **Una sola resolución por dispositivo**, todo 1024 en móvil: sustituida por perfiles mixtos. r4 vuelve a 1024 en todo, pero a través de los perfiles del manifiesto, que siguen permitiendo subir un atlas concreto.
- **Topes por archivo.**
- **Conservar las entregas anteriores en `public/` para volver atrás** (lo hacía `3becc4d`).

## Se ha roto si…

- Falla `src/experiences/murcia/assets/lightmaps/unifiedManifest.test.ts` (bytes, cabeceras, totales exactos o tope por perfil).
- Falla `loadUnifiedLightmaps.test.ts`, `inheritLight.test.ts` o `facadeRecords.test.ts`.
- Una ventana o un pretil de tejado sale sin luz, con su material sin hornear.
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

`src/experiences/murcia/config/murciaConfig.ts` (`modelPath`, `lightmaps`), `src/experiences/murcia/config/environmentConfig.ts` (`LightmapConfig`), `src/experiences/murcia/assets/lightmaps/` (`unifiedManifest.ts`, `loadUnifiedLightmaps.ts`, `inheritLight.ts`, `inheritanceSolve.ts`, `inheritanceWorker.ts`, `lightInheritance.ts`, `supportIndex.ts`, `loadLightmaps.ts`, `deviceResolution.ts`, `lightmapManifest.ts`), `src/experiences/murcia/assets/cityBytes.ts`, `src/experiences/murcia/assets/facadeRecords.ts`, `public/models/`, `public/textures/murcia/lightmaps-*/`, `checks/city-asset.ts`, `docs/murcia/lightmaps-v5.2-r5-integration.md` (registro de r5; v8 aún no tiene registro de integración)
