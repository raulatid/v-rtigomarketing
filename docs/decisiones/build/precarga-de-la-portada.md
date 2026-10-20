# `/` precarga todos los chunks salvo los que se abren por intención

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, el bucle de modulepreload); prioridad baja para Murcia desde el 2026-08-20 (`42e3956`); predicado compartido con el presupuesto desde el 2026-08-31 (`ac8c88d`); comprobación de aristas estáticas desde el 2026-09-15 (`70cadaa`); todas las exclusiones por módulo vigiladas desde el 2026-10-20 (`4215ab8`) · **Sustituye a:** lo que dice de la precarga ADR 013 («Consequences»: el blog se precarga degradado en `/`)

## Decisión

1. **`introEntry` inyecta en `index.html` un `<link rel="modulepreload">` por cada chunk que no es entrada**, salvo los que excluye `isPreloadedOnIndex`. `blog.html` y `404.html` no reciben ni el script del arranque ni ninguna precarga (`isBlogDocument`, `isNotFoundDocument`).
2. **Por defecto, todo chunk nuevo se precarga.** Excluir uno es una decisión explícita en `isPreloadedOnIndex`, y solo para lo que el visitante abre por intención o lo que no existe en producción:
   - el panel legal (`src/components/LegalPanel.tsx`) y el diálogo de reclamación del punto de vista (`src/components/ClaimDialog.tsx`);
   - la ruta del blog (`isBlogRouteChunk`) y su marco (`isBlogSurfaceChunk`), que la ciudad pide al empezar la aproximación;
   - la marca 3D de la cabecera del blog (`isHeaderLogoChunk`);
   - las herramientas de depuración (`isStatsChunk`, `isObserverDebugChunk`; ver [depuración fuera de producción](depuracion-fuera-de-produccion.md)).
3. **Una exclusión tiene que ser una costura perezosa de verdad.** El build falla si un chunk del conjunto inicial importa de forma estática uno excluido.
4. **Toda exclusión exige que su chunk exista y sea único:** `BlogRoute`, `BlogSurface`, `LegalPanel`, `ClaimDialog` y la marca del blog en todos los sabores; stats y el overlay de autoría fuera de producción (en producción, ninguno).
5. **Los chunks se identifican por su módulo de origen, no por su nombre:** Vite deriva los nombres y no son estables. Un chunk que Rollup corta para dos consumidores no tiene fachada, así que `BlogSurface` y stats se buscan entre los módulos del chunk.
6. **Lo que no hace falta para el primer fotograma tras la intro se precarga con `fetchpriority="low"`:** hoy, `MurciaExperience` y `disposal`.

## Por qué

- `modulepreload` es lo único que descarga y compila **sin evaluar**. Adelantar el `import()` no sirve: evalúa en cuanto el grafo se resuelve. Así la red trabaja desde el primer parseo, en paralelo con la app, y three se evalúa cuando `LazyScene` lo pide, después de pintar el dibujo.
- Una exclusión que deja de coincidir falla abierta: `/` precargaría algo más y el presupuesto lo absorbería como crecimiento normal. Por eso todas se vigilan.
- Lo que se abre por intención (blog, textos legales, reclamación) no debe gastar bytes ni peticiones del arranque. La escena dibuja su propio logo, así que la marca de la cabecera del blog solo le costaría a `/` una petición.
- modulepreload es de prioridad alta por defecto; los chunks de un mundo al que el visitante no llega hasta que pulsa un marcador competían por ancho de banda con los que necesita el primer fotograma tras la intro.

## Qué se descartó

- Adelantar los `import()` en lugar de precargar: evalúa three en el hilo principal.
- Precargar el blog en `/` con prioridad baja (lo que decía ADR 013 hasta el 2026-09-15).
- Subir `INITIAL_JS_REQUEST_BUDGET` cuando aparece un chunk que `/` no quiere: se excluye aquí.
- Meter el chunk de arranque en línea (ver [arranque sin dependencias](../intro/arranque-sin-dependencias.md)).

## Se ha roto si…

- `vite build` falla con «initial chunk … statically imports excluded …».
- `vite build` falla con «expected exactly one lazy BlogRoute chunk», «expected exactly one chunk for src/components/LegalPanel.tsx» (o `ClaimDialog.tsx`, `BlogSurface.tsx`) o «expected exactly one chunk faced by src/blog/headerLogoRuntime.ts».
- Falla `e2e/blog.spec.ts` («a cold scene defers the blog route until navigation requests it», «a cold /blog pays for the mark and nothing else»).
- Falla `e2e/degraded.spec.ts` («no WebGL 2: says so, and never evaluates the scene chunk»).
- La prioridad baja de `MurciaExperience` y `disposal`: sin test.

## Afecta a

`vite.config.ts` (`introEntry`, `isPreloadedOnIndex`, `isLegalPanelChunk`, `isClaimDialogChunk`, `isBlogRouteChunk`, `isBlogSurfaceChunk`, `isHeaderLogoChunk`, `isStatsChunk`, `isObserverDebugChunk`, `assertChunkBudgets`), `scripts/publicationPolicy.ts` (`isBlogDocument`, `isNotFoundDocument`), `src/components/LazyScene.tsx`, `src/components/LazyBlog.tsx`, `src/components/LazyLegalPanel.tsx`, `src/components/LazyClaimDialog.tsx`, `src/blog/BlogHeaderLogo.tsx`, `src/notFound/NotFoundLogo.tsx`, `e2e/blog.spec.ts`, `e2e/degraded.spec.ts`
