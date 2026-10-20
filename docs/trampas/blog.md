# Trampas: el blog

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/blog/`](../decisiones/blog/).

Ya documentado en otras áreas, y no se repite aquí: la reclamación `'blog'` de la cámara y su precedencia ([`murcia-camara.md`](murcia-camara.md), n.º 17); la tolerancia de tap de la pantalla (n.º 26 del mismo archivo); el lienzo en blanco por un retorno temprano en `RenderPipeline` ([`transicion.md`](transicion.md), n.º 15); la preferencia de movimiento leída una vez por documento (n.º 28 del mismo archivo).

## Documentos y carga

1. **Ninguna importación estática del blog desde la aplicación.** Ni `BlogRoute`, ni `blogPosts`, ni nada de `src/blog/` desde `src/main.tsx`. La costura es `LazyBlog.tsx`, y su `import()` debe seguir existiendo, o la regla «nada estático» se cumple en vacío. Fija: `check:architecture`.
2. **`route.ts` solo valida la forma.** Decidir si un tema existe exige importar el contenido, y este módulo lo alcanza `src/main.tsx`. Su `ID_PATTERN` está duplicado a propósito respecto al de `src/content/editorialBounds.ts` (reexportado en `invariants.ts`). Fija: `route.test.ts`.
3. **El 404 no puede importar `BlogRoute`**, solo `BlogSurface`: `BlogRoute` arrastra todos los cuerpos. Fija: `check:architecture` («the 404 entry cannot statically reach the generated blog content»).
4. **Los chunks excluidos de la precarga en `/` deben seguir siendo costuras perezosas.** Si un chunk inicial importa de forma estática uno excluido (`BlogRoute`, `BlogSurface`, la marca), el build falla («statically imports excluded»). Si renombras `BlogRoute.tsx` o `headerLogoRuntime.ts`, revisa `isBlogRouteChunk` y `HEADER_LOGO_MODULE`: el build exige exactamente un chunk de cada.
5. **`<LazyBlog>` no tiene fallback de Suspense, a propósito.** Lo que tapa el hueco hasta que el blog pinta es la cubierta de la aproximación. La cubierta la retira `BlogHost.onMounted` (en un `useLayoutEffect` de `BlogRoute`), no un efecto sobre `blogOpen` en `App`: ese efecto se dispararía con el chunk aún en vuelo y quitaría la cubierta sobre un fotograma vacío.
6. **El documento frío pinta el índice aunque la ruta se lea como `site`** (por ejemplo, `/blog.html` o un rewrite mal configurado). No es un error: ese documento solo puede ser el blog.

## Escena congelada

7. **Nunca `display: none` para ocultar la escena.** R3F mediría 0×0 y volvería a crear el buffer, el bloom y la huella de Murcia en cada ida y vuelta. Se usa `visibility: hidden` sobre `.app__scene`. Fija: `e2e/blog.spec.ts` (contadores de `__vertigoGl`).
8. **Con el blog abierto, `MurciaExperience.update()` no se llama.** Por eso:
   - la retirada de último recurso de la cubierta es un temporizador DOM (`FAILSAFE_MS` en `handoffImage.ts`);
   - un resize mientras se está aparcado se pone en cola y se aplica al volver (`setViewport` en `blogApproach.ts`): aplicarlo crearía geometría y textura dentro de la ventana en la que el e2e exige que no cambien;
   - el retorno lo arranca `App` desde un `useLayoutEffect`, para que la cubierta esté puesta en el mismo commit que vuelve a mostrar el canvas con su último fotograma.

   Sin test para el orden del `useLayoutEffect`.

## Historial

9. **Artículo → índice deshace (`history.go`), nunca empuja.** Si empuja, la salida cae en el artículo. Fija: `blogHistory.test.ts`, `e2e/blog.spec.ts`.
10. **El blog no debe leer `history.state` para saber si es frío o caliente.** Lo decide el anfitrión con `exitToScene`.
11. **`history.scrollRestoration` vuelve a su valor al salir del blog.** Si se queda en `'manual'`, la escena hereda un scroll manual. Fija: `e2e/blog.spec.ts`.

## Aproximación y pantalla

12. **El retorno cuelga de que `blogOpen` pase a falso, no del control del blog.** Si se engancha solo a `handleExitBlog`, el botón Atrás del navegador deja al visitante pegado a la pantalla. Fija: `e2e/blog.spec.ts` («the browser Back button flies back out…»).
13. **`openBlog` devuelve un booleano y hay que respetarlo.** Si la ruta se rechaza (warp en curso, Murcia sin terminar), la aproximación debe deshacer el viaje. Si no, el visitante queda aparcado delante de la pantalla, bajo una cubierta opaca, sin blog detrás. Sin test del rechazo.
14. **Al soltar la cámara, `adoptFromCamera` va ANTES de `release('blog')`.** El vuelo escribió la cámara sin pasar por el rig, y sin esto el primer fotograma de navegación salta. El campus vuelve a `setEnabled(this.active)`, nunca a un `true` a secas: el retorno puede terminar con Earth en pantalla.
15. **Un arrastre sobre la pantalla no es un clic.** Las dos puntas del gesto deben caer sobre un objetivo y el recorrido debe quedar por debajo del umbral de tap del tipo de puntero. En Murcia el paneo es libre, así que terminar un paneo sobre la pantalla es el caso común. Fija: `panelPointer.test.ts`, `e2e/blog.spec.ts`.
16. **El raycast contra la pantalla NO es recursivo.** La placa es hija de la malla, y las UV de su canto no significan nada en el espacio del núcleo. Fija: `panelPointer.test.ts`.
17. **El conjunto `edificio-blog` es objetivo, pero del MISMO listener que la pantalla.** No reintroduzcas un segundo listener sobre esos edificios (el antiguo `BlogBuilding.ts`), ni su punto de depuración `__vertigoBlogBuildingPoint`. Fija: `e2e/blog.spec.ts`.
18. **El giro de reposo de la pantalla se toma de la pose viva del rig**, nunca de un literal de `murciaConfig`: el azimut ya se ha movido dos veces.
19. **`BLOG_BUILDING_NODE_NAMES` vive en un módulo hoja (`blogDisplayConfig.ts`).** `checks/city-asset.ts` lo importa y los harnesses se empaquetan con esbuild, que no tiene loader para `.glsl`. Si lo mueves junto a la pantalla, el harness no compila. GLTFLoader elimina `[ ] . : /` de los nombres de nodo; de eso se encarga `findByAnyNameSpelling`. El nodo es uno solo, `edificio-blog`; el antiguo `blog_edificios` ya no existe.
20. **Con movimiento reducido, la aproximación no se mueve, pero la ruta cambia y la cubierta aparece igual.** Al volver, aterriza en la pose sin viajar (`bailOutOfReturn`). Sin test de esa rama.
21. **La cubierta queda en `z-index` 75 (`Z_INDEX` en `handoffImage.ts`), por DEBAJO de `.blog-root` (`blog.css`).** Así falla de forma segura: cuando el blog pinta, la tapa. Ponerla por encima escondería la página.

## Marca de la cabecera

22. **`headerLogoRuntime` no se importa de forma estática desde `src/blog/`.** Tampoco con un `import type` cuyo especificador no sea idéntico byte a byte al del `import()` del mismo archivo: `check:architecture` lo cuenta como arista estática, y eso mete three.js en el chunk del documento.
23. **Una instancia por documento.** Solo la conexión ACTUAL puede desacoplarse: un remontaje puede conectar el árbol nuevo antes de que React desmonte el viejo.
24. **Solo el renderer de la escena llama a `detectSupport`** (`graphics/decoders.ts`). En caliente hay dos contextos, pero la marca no carga KTX2. Si vuelve a usarlo, revisa `acquireKtx2Loader`.
25. **La lista de permitidos del e2e en frío aún admite `/textures/logoBake.ktx2`**, que ya no existe (`e2e/blog.spec.ts`). Es una permisividad sobrante, no un fallo; no la amplíes más.

## Tipografía

26. **Las familias propias del blog tienen nombre propio** (`'Vertigo Blog Inter'`, `'Vertigo Blog Serif'` en `blog.css`). En caliente, `blog.css` se inyecta en el documento vivo y `@font-face` es global: una familia registrada con un nombre que la escena ya pide cambiaría la tipografía de la escena al volver de un artículo. Fija: `e2e/blog.spec.ts` (la fuente del `body` antes y después). Hoy el blog pone delante las familias del sitio (`'Vertigo Display'`, `'Vertigo Text'`); el reparto es definitivo: ver [tipografías](../decisiones/interfaz/tipografias.md).

## Publicación

27. **En preview, `blogRouting` debe ceder ante un archivo real de `dist/`.** Si no, los documentos prerenderizados quedan muertos en local y el e2e comprueba un documento que producción no sirve. En dev no hay `dist/` y todo se reescribe. Fija: `e2e/publication.spec.ts`.
28. **Los slugs codificados no se decodifican al buscar en disco**: un separador codificado podría acabar siendo una ruta. Fija: `publicationPolicy.test.ts`.
29. **Un slug desconocido devuelve HTTP 200 con «Esa entrada no existe»**, porque el rewrite cae en `blog.html`. No es un 404 del servidor.

## Captura

30. **`scripts/blog-preview.mjs` no puede contener `process.exit(1)`**, ni un `.catch(() => process.exit(1))`: el contrato es que nunca falle un despliegue.
31. **El sandbox solo se desactiva con `VERCEL=1`.** No lo conviertas en un respaldo tras un fallo al lanzar.
32. **El píxel que sustituye a `cdn.sanity.io` debe ser transparente de verdad.** El primero que se probó era verde y parecía una portada cargada. Compruébalo mirando la captura, no leyendo la cadena.

## Pruebas e2e

33. **`e2e/blog.spec.ts` entra en Murcia con un tren de ruedas (`wheelStream`) justo después de `reachSite`**, que solo espera a `.audit-trigger` y 400 ms. Desde el 2026-10-16 (`368c4b5`) la ciudad se construye en `site`, y `attentionIsFree` exige `murciaReady` (`App.tsx`): las ruedas que llegan antes de que la ciudad esté lista se descartan. Ningún test espera una señal de «Murcia lista» antes del tren.

    **Hecho observado:** en `test-results/` (carpeta ignorada por git) hay una ejecución fallida del 2026-10-19. `.last-run.json` nombra dos tests fallidos, pero solo hay una carpeta de artefactos, la de «a warm round trip freezes the scene and never rebuilds it» (proyecto `chromium`). Falla en la primera espera de `inMurcia` tras el tren de ruedas, antes de tocar nada del blog. La captura muestra Earth en vista general, con «Ir a Murcia», «Scroll o desliza para viajar a Murcia» y un estado «Casi listo». Según la lectura de la traza que hizo el dossier de migración, el tren de ruedas tardó mucho más de lo previsto (hilo principal saturado) y el informe de assets de Murcia apareció en mitad del tren.

    **Hipótesis (no verificada ejecutando):** es una carrera entre el test y `murciaReady`, destapada por `368c4b5`. El segundo test fallido podría ser «the browser Back button flies back out…», que usa el mismo patrón, pero no se puede atribuir sin ejecutar. Pendiente de confirmar con el usuario: si el e2e debe esperar una señal de «Murcia lista» antes del tren de ruedas (un cambio de test, fuera de esta documentación), o si el fallo tiene otra causa.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Imports, costuras, entradas | `npm run check:architecture` + build (presupuestos y aserciones de chunks) |
| Historial, rutas, temas | `blogHistory.test.ts`, `route.test.ts` |
| Documentos estáticos y rewrites | `blogShell.test.ts`, `publicationPolicy.test.ts`, `vercelConfig.test.ts`; `e2e/publication.spec.ts` si se pide e2e |
| Aproximación, pantalla, cubierta | `blogTransition.test.ts`, `panelPointer.test.ts`, `handoffImage.test.ts`, `blogDisplay.test.ts`, `pageImage.test.ts`, `blogOrbitRing.test.ts` |
| Botón Blog de la cabecera | `useSceneShortcuts.test.tsx` |
| Escena congelada, marca, recorrido completo | `e2e/blog.spec.ts`, solo si se pide |
| Nombre del nodo del conjunto | `npm run check:asset:contract` |

**Sin cobertura:**
- el rechazo de `openBlog` a mitad de aproximación;
- el orden del `useLayoutEffect` del retorno respecto a la pintura;
- la rama de movimiento reducido del retorno;
- la memoria de GPU con el blog abierto en iOS;
- que la captura se haga de verdad en Vercel (solo lo muestra el log del build);
- el confinamiento del navegador de la captura.
