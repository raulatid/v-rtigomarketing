# El blog es un segundo documento

**Estado:** vigente · **Desde:** 2026-08-31 (`950edce`, ADR 013); el chunk deja de precargarse en `/` el 2026-09-15 (`70cadaa`) · **Sustituye a:** ADR 013 §1 y sus consecuencias sobre la carga; el párrafo «The blog is modelled and not rendered» de DECISIONS §31

## Decisión

1. **`/blog` tiene su propio HTML.** `blog.html` → `src/entries/blog.tsx` → `BlogRoute`, junto a `index.html` → `src/main.tsx` → `App`. Los dos documentos montan el mismo `src/blog/BlogRoute.tsx`; solo cambian las funciones de anfitrión que le pasan (ver [historial y salida](historial-y-salida.md)).
2. **Un `/blog` en frío no carga la aplicación 3D:** ni `App`, ni `LazyScene`, ni intro, ni Earth, ni cielo, ni ciudad, ni música, ni gesto de navegación, ni cursor propio, ni `styles.css`. Es una ausencia en el grafo de módulos, no un conjunto de guardas:
   - `vite.config.ts` declara cuatro entradas de Rollup (`index`, `blog`, `notFound`, `intro`), y `introEntry` no inyecta ni el script de la intro ni ningún modulepreload en `blog.html` (`isBlogDocument`).
   - `checks/architecture.ts` prohíbe que `src/entries/blog.tsx` alcance `src/experiences/` o `src/graphics/`.
   - La única excepción es la marca de la cabecera (ver [marca 3D en la cabecera](marca-3d-en-la-cabecera.md)).
3. **Desde `index.html`, el blog solo se alcanza a través de un límite dinámico.** `src/components/LazyBlog.tsx` es la costura. `checks/architecture.ts` exige las dos mitades: que `src/main.tsx` no alcance de forma estática ni `src/blog/` ni `src/content/generated/blogPosts`, y que sí los alcance de forma dinámica.
4. **`/` no precarga el blog.** `isPreloadedOnIndex` (en `vite.config.ts`) excluye el chunk de `BlogRoute` (`isBlogRouteChunk`) y el de `BlogSurface` (`isBlogSurfaceChunk`). El chunk se pide cuando empieza la aproximación (`prefetchBlog`, desde `App.handleBlogApproachStart`). El build exige exactamente un chunk perezoso de `BlogRoute` y que ningún chunk inicial importe de forma estática uno excluido.
5. **El chunk del blog lleva el conjunto de entradas completo** y su techo es `BLOG_BUDGET_BYTES` en `vite.config.ts`. Si el build falla por él, se mira si la biblioteca de artículos ha crecido más que la carga útil (separar metadatos del índice y cuerpos) antes de subir el número.
6. **Un `/blog` en frío captura en su propia entrada la preferencia de movimiento reducido** (`prefersReducedMotion()` en `entries/blog.tsx`), porque no hay intro que lo haga por él.

**Frontera:** los presupuestos (`BLOG_BUDGET_BYTES`, `INITIAL_JS_BUDGET_BYTES`, `ENTRY_BUDGET_BYTES`) y la política de precarga (`isPreloadedOnIndex`, `assertChunkBudgets`) son del área de build y presupuestos; aquí solo se dice qué exige el blog de ellos. La cabecera (`SiteHeader` con `layout="blog"`), la barra negra y el menú que monta `BlogSurface.tsx` son del área de interfaz. Hoy el blog monta el menú compartido con la escena (`SiteMenuLayer`, `SiteMenuStage`). Pendiente de confirmar con el usuario: si ese es el menú vigente del blog en móvil, frente al «campo de vidrio» que describe DECISIONS §26.16 (enmiendas del 2026-09-08). Las secciones de contacto, auditoría, legal y consentimiento que monta el blog (`idPrefix` `blog-*`) y la analítica de la entrada fría son de formularios y privacidad.

## Por qué

- Quien llega a `/blog` desde un buscador o un enlace compartido viene a leer. No debe pagar el arranque 3D.
- Reescribir `/blog` hacia `index.html` habría seguido ejecutando la intro, precargando three.js y las escenas y bajando las texturas de Earth. Cada cosa habría necesitado su propia guarda en un archivo distinto, y cualquiera podía romperse sin que nadie lo notara.
- Una importación estática del conjunto de entradas desde la entrada WebGL metería todos los cuerpos en la carga inicial de `/`, que crece con la biblioteca de artículos y no con el código.
- Precargar el chunk en `/` gastaba bytes del arranque en algo que se abre por intención. La aproximación dura lo bastante para que el chunk llegue antes del corte; si no llega, la cubierta de la aproximación espera.

## Qué se descartó

- Reescribir `/blog` hacia `index.html` con guardas por ruta.
- La regla «nada importa el contenido generado del blog» (ADR 011 y §31): caducó cuando el blog tuvo interfaz y se estrechó a «nada lo alcanza de forma estática desde `src/main.tsx`».
- Precargar el chunk del blog en `/` (ADR 013, «Consequences»).

## Se ha roto si…

- `npm run check:architecture` falla en una regla del blog («the app entry cannot statically reach…», «the blog entry never reaches…», «the blog IS reachable from the app entry, dynamically»).
- El build falla con «expected exactly one lazy BlogRoute chunk», «initial chunk … statically imports excluded …» o «blog chunk is …B, over the …B budget».
- `e2e/blog.spec.ts`: «a cold /blog pays for the mark and nothing else» (existe la intro, se pide algo de la escena o hay más de un canvas) o «a cold scene defers the blog route until navigation requests it».

## Afecta a

`blog.html`, `src/entries/blog.tsx`, `src/components/LazyBlog.tsx`, `src/blog/BlogRoute.tsx`, `src/App.tsx` (`handleBlogApproachStart`), `vite.config.ts` (`introEntry`, `isPreloadedOnIndex`, `isBlogRouteChunk`, `isBlogSurfaceChunk`, `BLOG_BUDGET_BYTES`, `assertChunkBudgets`), `checks/architecture.ts`
