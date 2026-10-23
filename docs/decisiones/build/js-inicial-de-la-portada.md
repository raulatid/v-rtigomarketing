# La puerta es todo el JS inicial de `/`; los techos por chunk son secundarios

**Estado:** vigente · **Desde:** 2026-08-31 (`ac8c88d`: el presupuesto pasa de la entrada al cierre inicial); límite de peticiones en su valor actual desde el 2026-09-04 (`84e1b28`); `SCENE_BUDGET_BYTES` desde el 2026-09-05 (`8e40377`); regla «no se sube» desde el 2026-10-16 (`aab6a3b`); valor actual de `ENTRY_BUDGET_BYTES` y presupuesto del worker del dibujo desde el 2026-10-20 (`b93ad2a`, `5969dc2`); valor actual de `INITIAL_JS_BUDGET_BYTES` desde el 2026-10-23 (excepción a la regla, decisión del usuario) · **Sustituye a:** el presupuesto único de la entrada (DECISIONS §16 y §26.4, ADR 011 y 013) y el bloque «Build budgets» de PROJECT_MEMORY §9 (archivado)

## Decisión

1. **El presupuesto principal mide lo que descarga un `/` en frío:** las dos entradas que el documento lleva como `<script>` (la app, `index`, y el arranque, `src/intro-draw/boot.ts`) más todos los chunks que acepta `isPreloadedOnIndex`. Tiene dos límites en `vite.config.ts`: bytes (`INITIAL_JS_BUDGET_BYTES`) y peticiones (`INITIAL_JS_REQUEST_BUDGET`).
2. **El conjunto que se mide y el que se precarga salen del mismo predicado** (`isPreloadedOnIndex`). Lo usan el bucle de precarga de `introEntry` y `assertChunkBudgets` (ver [precarga de la portada](precarga-de-la-portada.md)).
3. **`INITIAL_JS_BUDGET_BYTES` no se sube.** Si algo nuevo no cabe, se hace sitio quitando algo de este cierre. Lo dice también el mensaje de error. Su valor es la medida de un build más un margen pequeño, a propósito.
   - Excepción del 2026-10-23, por decisión del usuario: Conócenos, la hoja de servicios y los efectos de sonido llevaron el cierre a 1 478 156 B (ya sin las herramientas de depuración de Murcia, que llegaban a producción), y el límite pasó de 1 460 000 B a 1 485 000 B. La regla sigue vigente para lo que venga después.
4. **`INITIAL_JS_REQUEST_BUDGET` no tiene margen:** `/` hace exactamente ese número de peticiones. Cualquier chunk nuevo en `/` hace fallar el build y obliga a decidir.
5. **Un fallo trae la lista de chunks contados.** Un nombre nuevo en la lista es una decisión de carga: algo que antes no era alcanzable desde `/` ahora lo es. Un nombre que crece es crecimiento de la app. No tienen el mismo arreglo.
6. **Los techos por chunk son secundarios.** Si uno salta, se mira primero el total del cierre: si está sano, los bytes solo se han movido.
   - `ENTRY_BUDGET_BYTES` (entrada de la app): solo responde a «¿ha caído en la entrada una dependencia grande o un conjunto de datos generado?». three no es asunto suyo (ver [three en su chunk](three-en-su-chunk.md)).
   - `SCENE_BUDGET_BYTES` (el chunk que contiene `src/components/SceneCanvas.tsx`): canvas de R3F, pipeline de render, Earth, cielo y fondo. Su margen lo explica el comentario junto a `SCENE_BUDGET_BYTES` en `vite.config.ts`. Cuando salta, se decide si lo nuevo va tras una costura perezosa.
   - `BLOG_BUDGET_BYTES` (el chunk de `src/blog/BlogRoute.tsx`): crece con la biblioteca de artículos y es holgado a propósito (ver [segundo documento](../blog/segundo-documento.md)).
   - `INTRO_BUDGET_BYTES` (el arranque): ver [arranque sin dependencias](../intro/arranque-sin-dependencias.md).
7. **El worker del dibujo de la intro (`src/intro-draw/drawWorker.ts`) tiene su propio techo, `DRAW_WORKER_BUDGET_BYTES`.** Es un archivo aparte que crea `new Worker(...)` durante la apertura, no un chunk del grafo, así que ningún otro presupuesto lo cuenta. El build exige que haya exactamente un `drawWorker-*.js` emitido.
8. **three.js no tiene presupuesto de bytes.** Su forma la vigila una aserción estructural (ver [three en su chunk](three-en-su-chunk.md)).
9. **El contenido no gasta presupuesto de código.** Lo que crece con el editor y no con un commit (cuerpos del blog, textos legales) viaja en el chunk perezoso que lo muestra, y `check:architecture` impide que `src/main.tsx` lo alcance de forma estática (ver [segundo documento](../blog/segundo-documento.md) y [textos legales](../privacidad/textos-legales.md)).
10. **Se comprueban bytes sin comprimir; brotli y gzip solo se imprimen.**
11. **Si falta algo que se mide, el build falla.** No encontrar la entrada `index`, el arranque, el chunk de `SceneCanvas` o el worker es un error, no un tamaño cero.
12. Todo se comprueba en `generateBundle`, en todos los sabores del build (producción, preview y local).

## Por qué

- Un presupuesto sobre la entrada no ve lo que el bucle de precarga mete en la carga inicial: cualquier chunk nuevo entra sin avisar.
- Tampoco distingue mover bytes de quitarlos: añadir `blog.html` como segunda entrada sacó React de la entrada a un chunk compartido, y la entrada bajó dos tercios sin que el visitante descargara un byte menos.
- Las peticiones van aparte: con solo bytes, un chunk de ruta nuevo podría entrar en silencio. Una petición nueva en `/` merece que alguien la mire, pese lo que pese.
- El límite de bytes se subió siete veces en cinco semanas buscando arreglarlo con una precarga selectiva, y la causa era three (ver [catálogo de three](catalogo-de-three.md)). Con un límite que no sube, cada funcionalidad nueva tiene que decir qué saca.
- Margen cero en peticiones y margen pequeño en bytes: decisión del usuario (2026-10-20). No se fija un número que hoy no se pueda cumplir, y antes de cambiar uno se mide con un build.
- `SceneCanvas` es lo que se descarga antes de dibujar nada y es código propio que crece con cada funcionalidad de escena. three es una dependencia fijada que solo cambia al actualizarla: contar sus bytes mediría npm, no este repositorio.
- El worker se descarga en toda visita en frío a `/`, y el arranque tiene la regla de «sin dependencias y con un tamaño que alguien eligió».
- Los bytes sin comprimir solo cambian cuando cambia la carga útil. Brotli también cambia cuando cambia cómo el compresor ve el texto: eso es ruido en una puerta.
- Un presupuesto que desaparece con su sujeto no es un presupuesto (comentarios de `assertChunkBudgets`).

## Qué se descartó

- Un presupuesto solo sobre la entrada (el anterior al 2026-08-31).
- Subir el límite cada vez que algo no cabe.
- Hacer selectivo el bucle de precarga para ahorrar bytes: `MurciaExperience` ya se precarga con prioridad baja y se compila fuera del hilo principal; sacarlo solo retrasaría la ciudad.
- Convertir una funcionalidad nueva en import dinámico para que «no cuente»: el bucle de precarga la vuelve a meter (ver [precarga de la portada](precarga-de-la-portada.md)).
- Subir `INITIAL_JS_REQUEST_BUDGET` en uno para tener margen.
- Contar el worker dentro del JS inicial: tiene su propio techo.
- Un presupuesto de bytes para three.
- Comprobar brotli en vez de bytes sin comprimir.
- Abiertas, sin trabajo: diferir los cargadores de three que el arranque no necesita y dar a `MurciaExperience` un presupuesto propio (decisión del usuario, 2026-10-20).

## Se ha roto si…

- `vite build` falla con «initial JS for / is …B over … requests, past the …B budget» o «initial JS for / is … requests, past the … allowed».
- `vite build` falla con «app entry is …B, over the …B budget», «the scene chunk (…) is …B, over the …B budget», «blog chunk is …B, over the …B budget» o «the intro's draw worker is …B, over the …B budget».
- `vite build` falla con «app entry chunk not found», «intro boot entry not found», «the SceneCanvas chunk was not found» o «expected exactly one drawWorker file».
- `npm run check:architecture` falla en «the app entry cannot statically reach the generated blog content» o «the app entry cannot statically reach the generated legal texts».
- Alguien sube `INITIAL_JS_BUDGET_BYTES` en un diff: sin test.

## Afecta a

`vite.config.ts` (`INITIAL_JS_BUDGET_BYTES`, `INITIAL_JS_REQUEST_BUDGET`, `ENTRY_BUDGET_BYTES`, `SCENE_BUDGET_BYTES`, `BLOG_BUDGET_BYTES`, `INTRO_BUDGET_BYTES`, `DRAW_WORKER_BUDGET_BYTES`, `isPreloadedOnIndex`, `assertChunkBudgets`), `checks/architecture.ts`, `src/main.tsx`, `src/components/SceneCanvas.tsx`, `src/blog/BlogRoute.tsx`, `src/intro-draw/drawWorker.ts`, `src/intro-draw/introDraw.ts`, `src/content/legal.ts`
