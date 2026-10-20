# Al blog se entra por una pantalla, y la aproximación es la transición

**Estado:** vigente · **Desde:** 2026-09-09 (`31ec6c3`, plan 022); pantalla a la mitad el mismo día (`b4f6fc6`); el conjunto de debajo vuelve a ser objetivo el 2026-09-15 (`ecc5418`); el botón Blog de la cabecera vuela a la pantalla desde el 2026-09-26 (`6ca8e38`) · **Sustituye a:** DECISIONS §42 (salvo la captura, ver [captura de la página](captura-de-la-pagina.md)), la fila «The blog is entered by a tap on the `blog_edificios` cluster» de «Superseded» y la fila Blog de la tabla de §26.16 (enmienda del 2026-09-24)

## Decisión

1. **Una pantalla dibujada por shader flota sobre el conjunto `edificio-blog`** (`BLOG_BUILDING_NODE_NAMES` en `blogDisplay/blogDisplayConfig.ts`), con un anillo de texto debajo que invita a entrar (`blogOrbitRing.ts`). Desde la ciudad se entra al blog con un clic en el núcleo legible de la pantalla, en la invitación o en el conjunto. Los tres van por el mismo listener y tienen el mismo resultado (`panelPointer.ts`). Pendiente de confirmar con el usuario: si fue intencionado que el conjunto volviera a aceptar el clic en `ecc5418` (el commit habla solo de iluminarlo con el hover), o si debe quedarse solo con el hover.
2. **La aproximación:**
   - la cámara sale del rig (reclamación `'blog'`) y viaja por la normal de la pantalla hasta que el núcleo legible llena el encuadre;
   - la distancia final se resuelve en cada fotograma desde `coreHeight()`, así que sigue valiendo tras un cambio de tamaño;
   - al final, una cubierta a pantalla completa con la misma imagen que lleva la pantalla aparece por encima, y la ruta cambia detrás de ella;
   - no hay destello: los dos lados del corte son la misma página.

   Duración, curva y tramos de la cubierta: `BLOG_TRANSITION` en `blogDisplay/blogTransition.ts`. Comparte con el warp solo `createTransitionClock`; sus curvas son propias.
3. **Salir es el mismo vuelo al revés**, más corto (`BLOG_TRANSITION.returnDuration`), hasta la pose en la que estaba el visitante al hacer clic. Se dispara en CADA vuelta a la escena en caliente (el control del blog, el botón Atrás del navegador, un paso atrás desde un artículo), porque cuelga de que `blogOpen` pase a falso (`useLayoutEffect` en `App.tsx` → `releaseFromBlog`) y no de `handleExitBlog`.
4. **Sin cambio de documento.** `App` cambia la ruta en el mismo documento y la escena queda congelada (ver [escena congelada](escena-congelada.md)), así que el rig conserva la pose de salida.
5. **La pantalla no es un distrito:** no tiene estado de distrito, ni significado de servicio, ni controles. Mientras la aproximación tiene la cámara, ni el arrastre ni el zoom escriben la cámara y el campus se queda sordo (`campus.setEnabled(false)`). Al soltarla, `adoptFromCamera` y luego `release('blog')`. La reclamación y su precedencia están en las [trampas de la cámara de Murcia](../../trampas/murcia-camara.md), n.º 17.
6. **Las negativas se ven.** `openBlog` devuelve si la ruta se aceptó. `App.handleOpenBlog` la rechaza durante un warp o si Murcia no está lista (`murciaReady`), y entonces la aproximación deshace el viaje. Con un distrito abierto, el clic no cuenta (`blocked`).
7. **Movimiento reducido: no hay vuelo, pero sí cubierta y cambio de ruta.** Al volver, se aterriza en la pose de salida sin viajar (`bailOutOfReturn`).
8. **El botón Blog de la cabecera de la escena:**
   - en la ciudad, vuela a la pantalla (`flyToBlog`, solo desde la vista general de la ciudad);
   - en Earth, hace el warp y después el vuelo (`requestBlog`, que se consume cuando el warp suelta el rig); si el warp se rechaza, no hace nada;
   - si el vuelo se rechaza (hay un distrito abierto, no hay pantalla), abre `/blog` sin vuelo;
   - en móvil, la pulsación espera a que el menú termine de cerrarse (`useSceneShortcuts.ts`).

   La cabecera del propio blog no lleva los atajos Blog y Servicios.
9. **Tamaño y colocación:** `PANEL_HEIGHT`, `SHELL_BLEED` y `SHELL_THICKNESS` en `blogDisplay.ts`; `PANEL_ELEVATION` y `PANEL_TILT_DEGREES` en `blogDisplayConfig.ts`. El giro de reposo se toma de la pose viva del rig al construir la pantalla (`restingYawDegrees: rig.getPose().azimuthDegrees` en `MurciaExperience.setupBlogDisplay`), nunca de un literal de `murciaConfig`. El porqué de cada cifra está en el comentario junto a la constante. Que la pantalla quede en plano al aterrizar lo decide la [pose de reposo](../murcia/pose-de-reposo.md). Pendiente de confirmar con el usuario: si, tras la pose de reposo de `67661d5` y la reducción a la mitad, se ha dado por bueno el encuadre de la pantalla (elevación e inclinación frente al ángulo de reposo) o sigue abierto, como lo dejó §42.

## Por qué

- Entrar con un vuelo de cámara hace del blog un lugar de la ciudad y no un enlace.
- Dos formas de entrar sobre la misma parte de la escena, una instantánea y otra con vuelo, se decidirían a suertes según qué malla alcance primero el rayo. Por eso se borró el tap antiguo y, cuando el conjunto volvió a ser objetivo, lo hizo con el mismo listener y el mismo resultado.
- La pantalla tiene la proporción de la ventana para que el núcleo pueda convertirse exactamente en el viewport del navegador.
- Se redujo a la mitad porque al cliente le parecía enorme junto a los edificios de Murcia.

## Qué se descartó

- El tap sobre el conjunto que abría el blog sin transición (`interaction/BlogBuilding.ts`, borrado el 2026-09-09).
- El cambio de documento del laboratorio (`location.assign('/blog')`, token en `sessionStorage`, script clásico en `index.html`, recarga por bfcache).
- Un destello negro sobre el corte.
- Unir esta pantalla con la de servicios en una abstracción común.
- Abrir `/blog` directamente desde Earth con el botón de la cabecera: se saltaba la cubierta y la precarga, y abría la ruta con la ciudad aún construyéndose.

## Se ha roto si…

- `e2e/blog.spec.ts`, «a warm round trip…»: un arrastre sobre la pantalla abre el blog, la entrada no pide el chunk perezoso, la cubierta sigue visible tras pintarse el blog o reaparece `__vertigoBlogBuildingPoint`. O «the browser Back button flies back out, not just the blog control».
- Fallan `blogTransition.test.ts`, `panelPointer.test.ts`, `handoffImage.test.ts`, `blogDisplay.test.ts`, `blogOrbitRing.test.ts` (en `src/experiences/murcia/blogDisplay/`) o `src/app/useSceneShortcuts.test.tsx`.
- `npm run check:asset:contract` (`checks/city-asset.ts`, sección 5b) no encuentra el nodo del conjunto.
- Al aterrizar en Murcia, la pantalla queda fuera de plano (ver [pose de reposo](../murcia/pose-de-reposo.md)).

## Afecta a

`src/experiences/murcia/blogDisplay/` (todo), `src/experiences/murcia/MurciaExperience.ts` (`setupBlogDisplay`, `flyToBlog`, `requestBlog`, `releaseFromBlog`, `dismissBlogCover`), `src/App.tsx` (`handleOpenBlog`, `handleBlogApproachStart`, `handleBlogMounted`, el `useLayoutEffect` de `blogOpen`), `src/app/useSceneShortcuts.ts`, `src/components/SceneShortcuts.tsx`, `checks/city-asset.ts`
