# Trampas: build y presupuestos

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/build/`](../decisiones/build/).

## Presupuestos y chunks

1. **Un import dinámico no saca nada de la carga inicial de `/`.** El bucle de precarga de `introEntry` precarga todo chunk que no sea entrada. Para que algo no viaje en `/` hay que excluirlo en `isPreloadedOnIndex`, y solo si es una costura perezosa de verdad. Fija: `vite.config.ts` («initial chunk … statically imports excluded …»).
2. **Los presupuestos se comprueban en todos los sabores del build, y fuera de producción el cierre es más grande.** Un build local o una preview llevan el panel `/debug` en la entrada, las ramas de depuración sin plegar y los chunks de stats y del overlay (estos dos, excluidos de la precarga). Un cambio puede pasar en producción y fallar en la preview, o al revés en las aserciones de stats y overlay. Sin test.
3. **`VERTIGO_SKIP_BUDGETS` se salta todas las aserciones de `assertChunkBudgets`**, también las estructurales (three, arranque sin imports, worker, stats y overlay en producción, exclusiones), y el build escribe `dist/`. Sirve para inspeccionar en local un bundle que fallaría; nunca para desplegar ese `dist/`. En Vercel la configuración se niega a cargar si está definida. La guarda es `vite.config.ts` («VERTIGO_SKIP_BUDGETS is set on Vercel»), solo en Vercel. Sin test.
4. **Un presupuesto que falla no deja `dist/`.** La aserción aborta en `generateBundle`. `blogRoutes` y `publicationHygiene` se callan a propósito cuando no se escribió nada. El error útil es el primero del log, no el último.
5. **Un chunk nuevo puede aparecer sin código nuevo.** Cuando un módulo gana un segundo consumidor dinámico o una entrada nueva lo comparte, Rollup lo corta en un chunk propio: más peticiones, mismos bytes. Pasó con la cabecera del blog (`utils/easing`, `graphics/decoders`) y con el documento 404 (`useRoute`). Con margen cero, el presupuesto de peticiones salta. Antes de excluir nada, mira si hay una arista estática que sobra. Fija: `INITIAL_JS_REQUEST_BUDGET`.
6. **El nombre de un chunk no dice qué lleva.** Rollup lo nombra por un módulo que mete, y el chunk compartido con React DOM se llama como un módulo pequeño de la app (hoy, `googleAnalytics`). Para atribuir bytes, usa `VERTIGO_SKIP_BUDGETS=1`, que imprime los módulos más pesados de cada chunk.
7. **Un módulo que comparten dos chunks acaba en el chunk compartido, con todo lo que importa como valor.** Las reglas de dependencias de `check:architecture` no lo ven, porque la dirección es correcta. Un módulo que cruza una frontera de chunks debe llevar solo lo que necesitan los dos lados. Pasar a `import type` no cambia nada: hay que quitar el reexport o mover el valor. Mídelo, no lo razones. Sin test.
8. **El worker del dibujo se busca por el nombre del archivo emitido** (`drawWorker-*.js`), no por módulo: Vite lo emite como asset, no como chunk. Si renombras `drawWorker.ts`, el build falla hasta que actualices la búsqueda y `DRAW_WORKER_BUDGET_BYTES`. Fija: `vite.config.ts` («expected exactly one drawWorker file»).

## Precarga

9. **La prioridad baja se decide por el nombre del archivo** (`/MurciaExperience|disposal/` en `introEntry`), al contrario que las exclusiones, que se identifican por módulo. Si Vite cambia el nombre, el chunk pasa a prioridad alta sin error. Sin test.
10. **Una exclusión nueva en `isPreloadedOnIndex` necesita su guarda.** Las actuales por módulo de origen exigen que coincida exactamente un chunk; stats.js y el overlay de autoría, ninguno en producción y uno fuera de ella (ver [precarga de la portada](../decisiones/build/precarga-de-la-portada.md), Decisión 4). Una que se añada sin esa comprobación falla abierta si deja de coincidir, y `/` vuelve a precargarlo en silencio. Sin test (para las futuras).

## three

11. **Un chunk manual no es una valla, es un imán.** Si fijas un directorio con `manualChunks`, Rollup mete allí también los módulos que comparte con sus vecinos, y otros chunks pasan a importarlo. Por eso solo se fija three.
12. **No importes una constante de un módulo que importa three.** Desde la entrada da una arista estática a three (`galaxyBandConfig.ts` existe por eso). Desde un módulo que comparten dos consumidores, saca ese módulo de su chunk perezoso y suma un modulepreload en `/` (`CornerLogoLayer.tsx`). Fija: la aserción estructural de three, solo para la entrada.
13. **La aserción de three busca un chunk llamado `three` y solo mira la entrada.** Si no hay chunk con ese nombre (por ejemplo, porque `manualChunks` deja de coincidir con la ruta de `node_modules/three/`), no comprueba nada y no falla. Lee `entry.imports`, que incluye las importaciones transitivas porque Rollup las sube a la entrada por defecto (`output.hoistTransitiveImports`): no desactives esa opción sin reescribir la comprobación. Sin test.
14. **R3F registra todo three si se le deja.** Una versión nueva de `@react-three/fiber` que cambie `extend(THREE)` hace fallar el build y el servidor de desarrollo a propósito. Revisa la eliminación contra la versión nueva; no quites la comprobación. Fija: el plugin `vertigo-three-catalogue`, como guarda del build; `threeCatalogue.test.ts` solo fija el contenido del catálogo.

## Depuración

15. **El minificador solo elimina lo que depende de un literal de compilación, y solo dentro de la rama.** `DEBUG_TOOLS_ENABLED` se pliega, pero un `import` estático de lo que esa rama usa sigue en el bundle: `protoSky.ts` comprueba `DEBUG_TOOLS_ENABLED` dentro de `parse()`, y `EarthExperience.tsx` importa `SkyShellCube` de forma estática igualmente. Un UMD con efectos secundarios (`stats.js`) no se elimina nunca: solo con un import dinámico. Fija: solo para stats y el overlay de autoría.
16. **`DEBUG_TOOLS_ENABLED` se escribe en línea.** Envolver la lectura de `__VERTIGO_ENV__` en una función hace que esbuild no la pliegue, y las ramas viajan a producción (SEC-11). Fija en parte: las aserciones de stats y overlay y `e2e/production-hygiene.spec.ts`.

## Herramientas

17. **Los plugins propios de `vite.config.ts` solo se han validado con Vite 5.** Una actualización de Vite o de Rollup puede cambiar los nombres de los chunks, el orden de los hooks, cómo se emite el worker o cómo se cortan los chunks compartidos. Haz una pasada propia de verificación con el build; no la mezcles con otra migración. Sin test.
18. **El código cita planes que no están en el repositorio** («plan 002», «plan 005», «plan 025»…): `docs/plans/` está en `.gitignore`. Esas referencias se quedan (decisión del usuario); no las busques en git, y no deduzcas de ellas una decisión vigente. Sin test.
19. **`scripts/proto/` son herramientas de medida de los planes 005, 007 y 008** (cielo, hologramas, destello del arranque). Se conservan. Escriben por defecto en `docs/plans/`, que está ignorado, necesitan un `vite preview` levantado y no forman parte de ningún script.

## Cadena de comandos

20. **`check` y `build` encadenan con `&&`: el primer fallo detiene el resto.** Si falla `check:architecture`, los demás harnesses no llegan a ejecutarse, y la salida no dice si también habrían fallado. Corrige y vuelve a ejecutar, o lanza el `check:<nombre>` concreto. Sin test.
21. **Solo `dev`, `check` (y por tanto `build`), `e2e` y `e2e:update` regeneran el contenido**, por sus scripts `pre*`. `typecheck`, `test`, `test:coverage`, los `check:*` sueltos, `vite build` y `e2e:ui` usan lo que haya en `src/content/generated/`: en un clon limpio fallan, y después de publicar en Sanity prueban contenido viejo. Ver también [`contenido.md`](contenido.md), n.º 2. Sin test.
22. **`check:studio` termina en verde sin hacer nada si el Studio no está instalado.** Ver [`contenido.md`](contenido.md), n.º 24.
23. **Un archivo en `checks/` no es un harness por estar ahí.** Solo cuenta lo que está en `check:harnesses` y llama a `finish()`.
    - `checks/studio-typecheck.mjs` no llama a `finish()` a propósito: pasa hacia arriba el código de salida del Studio.
    - `checks/campus-sheet.mjs` es una prueba de Playwright del arrastre y el scroll de la hoja de servicios en tres viewports táctiles. No la ejecuta ningún script, y hoy falla (ver «Posibles defectos»). No la cuentes como cobertura. Se lanza a mano con `node checks/campus-sheet.mjs`, necesita Chromium y deja capturas en `.cache/`.
    - El `check:asset` completo está fuera de la cadena a propósito (ver [contrato del GLB](../decisiones/build/contrato-del-glb.md)).

    Sin test.
24. **Los harnesses se empaquetan con esbuild para Node:**
    - no hay loader de `.glsl`: un harness que alcance un shader no compila (ver [`blog.md`](blog.md), n.º 19);
    - no existe `import.meta.env`: los flags se leen con guarda `typeof` en `src/platform/buildFlags.ts`. No quites la guarda;
    - `import.meta.dirname` apunta a `node_modules/.cache/` (ver [`contenido.md`](contenido.md), n.º 6).
25. **`npm run typecheck` no mira los `.mjs`** (`tsconfig.json` no tiene `allowJs`): `scripts/*.mjs`, `scripts/proto/`, `checks/studio-typecheck.mjs` y `checks/campus-sheet.mjs`. Un error ahí solo aparece al ejecutarlos. Sin test.
26. **`node_modules/.cache/` es salida de build, no almacén.** Los `check:*` empaquetados con esbuild, `content:build` y `check:publication` escriben ahí su bundle, y `npm ci` lo borra entero. No guardes ahí fuentes de recursos.

## Entorno

27. **El entorno del build no va en `.env`.** Un `.env`, `.env.local`, `.env.production` o `.env.production.local` que nombre `VERCEL_ENV` o `VITE_VERCEL_ENV` hace fallar `vite build`, `content:build` y `check:publication`, aunque coincida con la shell. Exporta la variable en la shell. Fija: `scripts/buildEnvironment.test.ts`.
28. **`VITE_VERCEL_ENV` y `VERCEL_ENV` no ensayan lo mismo.** El cliente lee las dos; `content:build`, `server/config.ts` y `e2e/production-hygiene.spec.ts` solo `VERCEL_ENV`.
    - Con `VITE_VERCEL_ENV=production` (la receta de `.env.example`) sale un cliente de producción con contenido de fixtures, sin credenciales, y `e2e/production-hygiene.spec.ts` se salta entero.
    - Con `VERCEL_ENV=production`, `content:build` exige una fuente con nombre (ver [fallo estricto y fuentes](../decisiones/contenido/fallo-estricto-y-fuentes.md)): necesitas `SANITY_PROJECT_ID` y `SANITY_DATASET` en `.env`.

    Receta completa (PowerShell): `$env:VERCEL_ENV = 'production'`, `npm run build`, leer `dist/robots.txt`, `dist/sitemap.xml` y las etiquetas `canonical`/`og:url`; si se pide e2e, `npx playwright test e2e/production-hygiene.spec.ts --project chromium` en la misma shell. Sin test.
29. **Un `VERCEL_ENV` ausente en Vercel o mal escrito en cualquier sitio detiene el build**, igual que en el contenido (ver [`contenido.md`](contenido.md), n.º 5). Fija: `scripts/buildEnvironment.test.ts`, `content/lib/config.test.ts`.

## Salida

30. **Todo lo que escriba en `dist/` después de `vite build` debe ir antes de `check:publication`**, o nadie verifica lo que se publica. Hoy solo escribe `blog:preview`. Sin test.
31. **Los comentarios HTML se quitan después de que el generador del blog consuma sus marcadores.** Si cambias el orden de los plugins de `vite.config.ts`, las cabeceras del blog pierden sus marcadores. Fija en parte: `scripts/publicationHygiene.test.ts` («cleans the blog only after its markers…») prueba el orden de las funciones, no el de los plugins.

## Vercel

32. **`vercel.json` no admite comentarios, y un despliegue rechazado no se nota en la URL.** Ver [`formularios-y-privacidad.md`](formularios-y-privacidad.md), n.º 18. Después de desplegar, comprueba en Vercel que el despliegue nuevo está activo antes de buscar otra causa.
33. **El ajuste de Node del panel de Vercel no se aplica mientras exista `engines.node`.** «Project Settings» marca otra versión: si alguien quita `engines`, el despliegue cambia de Node sin tocar nada más. Sin test.
34. **`api/`:** imports con `.js`, nada de tests ni utilidades dentro, y las e2e no pasan por los adaptadores (ver [`formularios-y-privacidad.md`](formularios-y-privacidad.md), n.º 1-3). `check:functions` mira solo `api/`, no `middleware.ts`.
35. **`installCommand` tiene un límite de longitud y su script debe terminar en `exec npm install`.** El código de salida de la instalación es el de npm (ver [captura de la página](../decisiones/blog/captura-de-la-pagina.md)). Sin test.

## Pruebas e2e

36. **`npm run e2e` reconstruye (`pree2e`), pero `e2e:ui` y `npx playwright test` no:** prueban el `dist/` que haya. Y `pree2e` no ejecuta `check` ni `check:publication`. Sin test.
37. **En local, Playwright reutiliza un servidor que ya esté en el puerto de `baseURL`** (`reuseExistingServer`). Un `vite preview` viejo o de otra copia del repositorio hace que la suite evalúe otro artefacto. Comprueba el puerto y mata los servidores viejos antes de depurar un fallo fantasma.
38. **`hasTouch: true` sin perfil de dispositivo sigue diciendo `hover: hover`**, y las reglas `(hover: none)` y `(pointer: coarse)` no se aplican. Por eso los proyectos móviles usan descriptores completos. Aun así, los dos son Chromium: no prueban Safari.
39. **`test-results/` solo guarda la última ejecución** y está ignorada. `.last-run.json` puede nombrar más tests fallidos que carpetas de artefactos.

## Publicación de recursos

40. **Sustituir un archivo de `public/` sin cambiarle el nombre no se ve tras desplegar.** `public/` no lleva hash y `vercel.json` cachea `earth`, `models`, `textures`, `libs`, `draco`, `logos` y `media` con revalidación diferida; `audio` y `fonts` son `immutable`, y en ellos el hash en el nombre es obligatorio (ver [despliegue en Vercel](../decisiones/build/despliegue-en-vercel.md)). Versiona el nombre: GLB y carpeta de lightmaps con versión, o hash en el nombre (receta para la música en `CREDITS.md`; las fuentes también lo llevan, sin receta escrita). El cielo es el caso ya vivido ([`earth.md`](earth.md), n.º 29). Sin test.
41. **Lo que está en `public/` funciona en `npm run dev` aunque no se publique.** El servidor de desarrollo sirve la carpeta entera; el build, solo lo que acepta la lista de `isPublicAsset`. Un archivo o una carpeta nuevos que la lista no conoce no se publican, y no falla nada: es un 404 en producción. Una carpeta o una extensión nuevas exigen tocar `PUBLIC_ROOTS` o `PUBLIC_EXTENSIONS` y su test; revisa `dist/` después de añadir algo a `public/`. Fija: `scripts/publicationHygiene.test.ts`, solo para los casos que enumera; el archivo nuevo, sin test.
42. **`.svg` está entre las extensiones publicables:** un SVG en `logos/` o `textures/` saldría publicado. La barrera contra los SVG subidos está en el replicador de contenido, no aquí (ver [medios replicados](../decisiones/contenido/medios-replicados.md)). Sin test.
43. **Los binarios llevan metadatos, y los metadatos llevan rutas del disco.** Blender, KTX-Software y los scripts de entrega las escriben. El build lee el bloque JSON de cada GLB y los pares clave/valor de cada KTX2, y falla con `local filesystem path`. Limpia el archivo en origen; no relajes la expresión regular. Fija: `scripts/publicationHygiene.test.ts`.
44. **La búsqueda de credenciales lee cada archivo completo, binarios incluidos; la de rutas locales, solo texto y metadatos,** porque unos píxeles comprimidos pueden parecer `C:\`. No unifiques las dos. Fija: `scripts/publicationHygiene.test.ts` («checks the KTX2 key/value section rather than compressed pixel data»).
45. **Nada comprueba que un recurso publicado tenga lector.** Dos casos conocidos e intencionados:
    - `textures/murcia/tower/global-earth-network-connections-001.webp` sale también en producción, donde el contenido viene de Sanity y no lo nombra. Lo leen los builds con `content/fixtures` y `content/seed`. Se queda: no lo borres por «huérfano».
    - `draco/draco_decoder.js` es el respaldo asm.js de three: se publica, y un navegador con WebAssembly no lo pide.

    Sin test.
46. **Casi nada comprueba que existan los archivos que nombra la configuración.** Solo el GLB de la ciudad (`check:asset:contract` lo abre) y los lightmaps (`unifiedManifest.test.ts`). La Tierra, el cielo ([`earth.md`](earth.md), n.º 30), el satélite, la marca y la música dependen del e2e o de mirar.

## La ciudad

47. **Un fallo de lightmaps no es fatal.** `loadUnifiedLightmaps` avisa `[lightmaps] not applied` y la ciudad carga con su material sin hornear. Tras cambiar la entrega, mira la consola en escritorio y en móvil emulado. Sin test que lo convierta en fallo.
48. **El tope por perfil lo aplican el runtime y un test unitario, no un harness.** Si el manifiesto lo supera, `npm run build` falla en `npm run test`, no en `check:harnesses`. Fija: `unifiedManifest.test.ts`.
49. **`unifiedManifest.test.ts` fija los totales exactos de cada perfil y su título nombra la entrega.** Una recodificación cambia esos números a propósito: actualízalos en el mismo commit y no conviertas la igualdad en «≤». El margen actual bajo `LIGHTMAP_BUDGET_BYTES` es mínimo en los dos perfiles: compara antes de pasar un atlas a 2048. Fija: el propio test.
50. **El techo del estadio se comprueba según el NOMBRE DEL ARCHIVO del GLB** (`checks/city-asset.ts`, sección «Nueva Condomina»). Un GLB nuevo con un nombre que no está en la lista cae en la rama de la reparación v4 y falla aunque esté bien. Esa rama exige:
    - un techo centrado sobre `estadio-base`;
    - apoyado en los pilares;
    - con el atlas `stadium-roof`.

    Añade el nombre a la lista y vuelve a medir las cotas del techo (y del Romea) desde Blender. Fija: `check:asset:contract`.
51. **Los perfiles del manifiesto y `murciaConfig.lightmaps.desktop1024` nombran atlas del horneado.** Un perfil que no nombra todos los atlas, o nombra uno que no existe, invalida el manifiesto (`invalid … atlas resolutions`). Una clave de `desktop1024` que ya no existe lanza `no atlas to reduce`. Es lo que se quiere: no la borres a ciegas. Fija: `unifiedManifest.test.ts` («names only atlases the shipped bake has»).
52. **El GLB trae una textura blanca embebida** (el trim neutro), y `dropEmbeddedTrim` la quita ANTES de los lightmaps. Si se reordena, cada material horneado la copia (`preserveAlbedo`): VRAM y una lectura de textura por fragmento para multiplicar por 1 (`8818633`). Sin test.
53. **El runtime encuentra un nodo también por `extras.runtime_name` (`nodeNames.ts`); el harness, solo por nombre.** Un nodo renombrado que solo conserva `runtime_name` funciona en la web y falla en `check:asset:contract`. Es intencionado: el nombre es el contrato. Fija: `check:asset:contract`.
54. **`check:asset:contract` se salta las secciones de UV, de topes y de samplers.** Un GLB con un material de más o sin `TEXCOORD_1` en un receptor pasa el build. El completo pasa hoy, pero no se encadena hasta que el GLB nuevo sea estable: ejecuta `npm run check:asset` a mano con cada GLB nuevo. Sin test en la cadena.
55. **Un nodo con `runtime_material` o `dynamic_rotation` no puede llevar `lightmap_atlas`.** El runtime rechaza el horneado entero (`dynamic surface was baked`), no solo ese nodo. Ningún check lo mira en el archivo. Sin test.
56. **Un rehorneado parte de la preparación congelada de la entrega anterior**, no de una nueva: así conserva las UV de lightmap, el orden de instancias y los rectángulos `_LIGHTMAP_ST` de lo que no cambia. Las herramientas de entrega reanudan por nombre de atlas, no por huella de la entrada: tras cambiar la fuente, empieza en un directorio nuevo. Ver el [contrato de exportación](../murcia/blender-export-contract.md), §7.1. Sin test.
57. **Una geometría sin cambios puede recibir sombras nuevas.** El conjunto de atlas que se rehornea se decide por dependencia de luz, no solo por qué mallas cambiaron, y toda la ciudad sigue en la escena como bloqueadora y fuente indirecta. Sin test.
58. **Recomprimir un atlas sin cambios para cuadrar el presupuesto no es rehornearlo,** y el registro de la entrega tiene que decirlo. Sin test.

## Compresión y decodificadores

59. **`public/draco/` y `public/libs/basis/` deben ser copias exactas de los de la versión de three instalada.** Al actualizar three, cópialos de nuevo (sin `draco_encoder.js`). Sin test: compáralos con `cmp` contra `node_modules/three/examples/jsm/libs/`.
60. **Un GLTFLoader sin KTX2Loader no degrada: rechaza el GLB entero** en cuanto aparece una imagen `KHR_texture_basisu`. Por eso `createAssetLoader.ts` lo registra aunque la ciudad no traiga imágenes Basis. Sin test.

## Ya migradas en otras áreas

- Quién crea `DRACOLoader` y `KTX2Loader`, y el contador: [`render.md`](render.md), n.º 13, y `check:render`.
- KTX2 de la Tierra: orientación abajo-izquierda y `flipY` sin efecto ([`earth.md`](earth.md), n.º 36); bytes frente a dimensiones (n.º 31); `sharp(...).toFile()` recodifica (n.º 28).

## Cómo verificar esta área

Usa la comprobación más barata que pueda refutar el cambio. El build completo va una vez al final, y solo si el cambio toca la cadena o la salida.

| Cambio | Comprobación |
|---|---|
| Cualquier cambio que pueda mover bytes o chunks de `/` | `npm run content:build` y `npx vite build`. Imprime «chunk budgets ok — initial JS for / …» o falla con la lista contada |
| Lo que ve producción (debug plegado, sin chunks de stats ni overlay) | `VITE_VERCEL_ENV=production npx vite build`, con la variable en la shell, no en `.env` |
| Atribuir qué módulo creció | `VERTIGO_SKIP_BUDGETS=1 npx vite build`: tamaño, imports y los módulos más pesados de cada chunk. Sin aserciones: no despliegues ese `dist/` |
| Exclusiones de la precarga y costuras perezosas | `npm run check:architecture` y build |
| Catálogo de three | `npx vitest run src/graphics/threeCatalogue.test.ts`; si cambia R3F, también `vite` (servidor de desarrollo) y build |
| Que `/` no pide el blog y que un `/blog` en frío no pide la escena | `e2e/blog.spec.ts`, solo si se pide e2e |
| Que sin WebGL 2 la escena se descarga pero no se evalúa | `e2e/degraded.spec.ts`, solo si se pide e2e |
| Que producción no lleva salida de depuración | `e2e/production-hygiene.spec.ts` contra un build con `VERCEL_ENV=production`, solo si se pide e2e |
| Tree-shaking y código muerto | build de producción e inspección de `dist/assets/*.js` |
| Scripts de `package.json` | Leer la cadena resultante; `npm run check` al final. `npm run build` solo si cambia `build` o un paso posterior a `vite build` |
| Un harness nuevo o modificado | `npm run check:<nombre>`; confirmar que está en `check:harnesses` y llama a `finish()` |
| `vitest.config.ts` | `npm test`; `npm run test:coverage` si cambian la cobertura o los umbrales |
| `tsconfig.json` | `npm run typecheck` (después de `npm run content:build` si no hay contenido generado) |
| `playwright.config.ts` | `npm run e2e`, solo si se pide |
| `scripts/buildEnvironment.ts` o el bloque de entorno de `vite.config.ts` | `npx vitest run scripts/buildEnvironment.test.ts`; al final, `npm run build` con `VERCEL_ENV=production` exportado si toca la rama de producción (n.º 28) |
| `scripts/publicationHygiene.ts`, `scripts/secretScan.ts` | `npx vitest run scripts/publicationHygiene.test.ts scripts/secretScan.test.ts`; `npm run check:publication` sobre un `dist/` recién construido |
| `scripts/publicationPolicy.ts`, `scripts/siteHead.ts` | `npx vitest run scripts/publicationPolicy.test.ts scripts/siteHead.test.ts`; ver también [`blog.md`](blog.md) |
| Cabeceras de seguridad, CSP o rewrites de `vercel.json` | `npx vitest run scripts/vercelConfig.test.ts` |
| Reglas de caché de `vercel.json` | Ningún test; `curl -I` contra el despliegue |
| `api/`, `server/` | `npm test` + `npm run check:functions` + `npm run check:architecture` (ver [`formularios-y-privacidad.md`](formularios-y-privacidad.md)) |
| `scripts/vercel-install.sh`, `engines`, `.nvmrc` | Nada en local; el log del build de Vercel |
| `.env.example` | Nada: es una plantilla que no lee nadie |
| Documentación | `npm run check:audit` **solo** si toca `docs/audits/reports/` o su README. El resto de `docs/` no lo comprueba nada: revisa los enlaces a mano |
| Hoja de servicios del campus | `node checks/campus-sheet.mjs` hoy falla (ver «Posibles defectos»); inspección en un dispositivo táctil |
| Recodificar atlas de lightmaps (misma geometría) | Carpeta con versión nueva si cambia algún archivo publicado (n.º 40). `npx vitest run src/experiences/murcia/assets/lightmaps` (bytes, cabeceras, mips y totales exactos; actualiza los totales a propósito). `npm run check:asset:contract`. Ciudad en escritorio y en móvil emulado, sin `[lightmaps] not applied` |
| GLB nuevo de la ciudad | **Antes de instalar:** `npm run check:asset -- <ruta-del-glb>` (completo) y `npm run check:asset -- <ruta> --contract-only`. **Al instalar:** `modelPath` y `lightmaps.baseUrl` nuevos; el nombre del archivo en la lista del techo (n.º 50); `npm run check:asset:contract`; `npx vitest run src/experiences/murcia/assets`; `npm run check:footprint` y `npm run check:campus` si cambian la placa, el anillo o el campus. Después, la consola y las vistas que cambian (llegada, campus, blog, torre). Retira la entrega anterior de `public/` en el mismo commit |
| Recurso nuevo en `public/` | Que su carpeta y su extensión estén en `isPublicAsset` (`npx vitest run scripts/publicationHygiene.test.ts`). Tras `npm run build`, que esté en `dist/` |
| Recurso sustituido en un sitio sin versión (Tierra, cielo, satélite, marca) | Renombrar o asumir la caché (n.º 40); comprobar en una ventana privada tras desplegar |
| Actualizar three | `cmp` de `public/draco/*` y `public/libs/basis/*` contra `node_modules/three/examples/jsm/libs/` |
| Cielo o texturas de la Tierra | Ver [`earth.md`](earth.md), «Cómo verificar esta área» |
| Lo visual | Una captura de los pocos estados que cambian, en escritorio y en móvil; los tests no lo juzgan |
| Antes de entregar, publicación completa | `npm run build` (ejecuta `check` antes de `vite build` e incluye `check:publication`; caro, una vez al final y solo si el cambio toca la cadena o la salida) |

**Sin cobertura:**
- que nadie suba `INITIAL_JS_BUDGET_BYTES`;
- la prioridad baja por nombre de archivo;
- la existencia del chunk `three` (la aserción falla abierta) y las aristas estáticas a three desde chunks que no son la entrada;
- el determinismo del build;
- las reglas de caché de `vercel.json` y el hash en el nombre de `/fonts/` y `/audio/`;
- los ajustes del panel de Vercel;
- que el build no avance tras un fallo de la puerta (se comprobó a mano una vez);
- `middleware.ts` (pendiente de retirar);
- el gesto de la hoja de servicios en navegador;
- WebKit;
- ningún presupuesto de bytes para el GLB (descartado mientras cambie), el cielo, la Tierra, el audio, las fuentes ni `dist/`; ninguno de VRAM ni de draw calls;
- nada detecta un recurso publicado sin lector, ni una ruta configurada que no existe (salvo ciudad y lightmaps);
- la paridad de los decodificadores con three no tiene test;
- la diferencia entre `check:asset` y `check:asset:contract` (UV, topes) no la vigila la cadena;
- el fallo de lightmaps en el runtime es un aviso de consola: ningún e2e lo convierte en fallo.

## Posibles defectos

- **`zstddec` viaja en el chunk `three`** (el build del 2026-10-20 encontró `ZSTDDecoder` en `three-*.js`, que está en la precarga de `/`). Es peso muerto si ningún KTX2 usa Zstandard; eso no se ha vuelto a comprobar. Frontera con recursos. Diferir los cargadores de three está abierto, sin trabajo.
- **`SkyShellCube` probablemente viaja en el chunk de la escena en producción** (ver n.º 15). Confirmado solo leyendo el código. Frontera con render.
- **`dist/index.html` lleva enlaces `modulepreload` duplicados** para algunos chunks (medición del 2026-10-20), probablemente uno de Vite y otro del bucle de `introEntry`. No añade peticiones; es ruido en el HTML. Sin investigar.
- **El determinismo del build** (dos builds limpios, mismos hashes) solo se comprobó a mano el 2026-08-11.
- **`checks/campus-sheet.mjs` falla hoy:** tras tocar el asa con la hoja en `expanded`, la hoja se queda en `expanded`. Es anterior a esta documentación y no se ha diagnosticado: puede ser un defecto del gesto o de la prueba. El usuario decidió pasarla a `e2e/`; ese traslado está en espera. Mientras, el arrastre de la hoja de servicios no tiene cobertura en navegador que pase.
- **La receta de `.env.example` (`VITE_VERCEL_ENV=production`) no ensaya el contenido ni la e2e de producción** (n.º 28). Es coherente con lo que dice el propio archivo, pero quien la siga cree haber ensayado producción.
- **Nada comprueba el hash en el nombre de `/fonts/` y `/audio/`**, que son `immutable`.
- **Títulos de sección desfasados en `checks/city-asset.ts`:** «1. UV coordinates (plan 001 Phase 3 — Blender owns trim placement)», «2. Material and texture economy (plan 001 Phase 8)» y «3. GPU instancing (kept — see the trim-sheet plan, decision 1)» citan el trim sheet retirado. Son comentarios.
- **Comentarios desfasados en `checks/city-asset.ts`:** la cabecera y el de `--contract-only` dicen que el harness completo falla por la sección UV y que el blog son dos nombres de nodo; el aviso «OPEN ASSET GAP… awaiting the trim-sheet re-export» y el comentario de `MATERIAL_CEILING` justifican la regla con el trim sheet; el de `TEXCOORD_1` habla de `asset_lightmap_kind` «since murcia-v7». Hoy el completo pasa y el blog es un nodo (`edificio-blog`).
- **La lista de nombres de la sección del techo incluye entregas retiradas** (`murcia-v5.1-lightmaps-r3.glb`, `murcia-v5.2-lightmaps.glb`, `murcia-v5.1-lightmaps.glb`, `murcia-v5.1-lightmaps-r2.glb`) y la rama de la reparación v4 es el caso por defecto.
- **§7b de `checks/city-asset.ts` aún tiene la rama `Assets_Static_*`** para un GLB sin `lightmap_atlas` (formato v7). Puede quedar viva tras retirar el código v7 del runtime.
- **`unifiedManifest.test.ts` repite los valores de los topes como literales** (`toBeLessThanOrEqual` y «exact profile budget boundaries») en lugar de leer `LIGHTMAP_BUDGET_BYTES`.
- **`murciaConfig.ts` copia los topes en un comentario** (encima de `lightmaps`): se desfasará con el primer cambio de `LIGHTMAP_BUDGET_BYTES`.
- **El comentario de `chooseLightmapResolution` (`lightmapManifest.ts`) cita los 15 atlas y los MiB de la r3.** El de `createAssetLoader.ts` justifica el KTX2 con «the trim-sheet migration».
- **`programKey` en `loadUnifiedLightmaps.ts` lleva `murcia-v5.1`.** Cosmético.
