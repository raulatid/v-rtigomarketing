# Trampas: interfaz

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/interfaz/`](../decisiones/interfaz/). Las trampas del panel del caso como hoja están en [Earth](earth.md), y las de la marca 3D del blog, en [blog](blog.md).

## Cabecera y menú

1. **La cabecera de la escena se monta siempre, también durante la intro.** El vuelo del logo 3D a la esquina mide `.site-header__row`; si se desmonta hasta `site`, el logo vuela a la posición por defecto. Solo los controles esperan a `site`.
2. **`CornerLogoLayer` mide la cabecera de la ESCENA** (`.site-header[data-layout='scene'] .site-header__row`). En una sesión caliente la del blog está en el mismo documento; un selector sin `data-layout` mediría la equivocada.
3. **El logo necesita el tamaño de la superficie en cuanto existe.** Sin él, lee `window.innerHeight` cada fotograma y fuerza un layout en Android. Fija: `CornerLogoLayer.test.tsx`.
4. **`CornerLogoLayer` no importa constantes de `logoMotion`:** una arista estática hacia un módulo que importa three cuesta un modulepreload en `/`.
5. **El velo blanco de Contacto se acota por `data-layout`, nunca por `tone`,** que se comparte entre superficies. En móvil no se aplica, a propósito.
6. **El burger de la escena es blanco en los dos tonos porque su regla va DESPUÉS de la de tono, con la misma especificidad** (`siteHeader.css`). No las reordenes sin mirar Murcia.
7. **`--site-header-tail` lo publica solo la cabecera de la escena** y lo quita al desmontarse. La brújula lo lee; no lo calcules a mano.
8. **El corte de móvil (`PHONE_QUERY` en `SiteHeader.tsx`) está escrito varias veces** (el propio `PHONE_QUERY`, `siteHeader.css`, `siteMenu.css` y otras). Cámbialas todas a la vez.
9. **El escenario del menú envuelve SOLO el contenido.** `perspective`, como `transform`, convierte el elemento en el bloque contenedor de sus `position: fixed`: una cabecera, un panel o un diálogo metidos ahí viajarían con la tarjeta.
10. **El escenario no recibe punteros y la tarjeta sí.** Si el escenario los recibe, tapa la capa del menú y las puertas no se pueden pulsar.
11. **R3F escribe `pointer-events: auto` en línea en su contenedor:** solo `!important` en `.scene-canvas` saca el canvas de debajo de una tarjeta inclinada.
12. **Nunca quites `resize={{ offsetSize: true }}` de `SceneCanvas`:** un resize con el menú abierto reasignaría el búfer de dibujo y el composer con el rectángulo inclinado. Fija: `e2e/mobile.spec.ts` («the burger hinges the scene away…»).
13. **La pose abierta se lee de `data-menu-state='open'`; lo demás, de `data-menu-open`.** Durante `closing` el menú sigue «abierto» para la app, pero la tarjeta ya vuelve.
14. **El listener que pliega el menú al elegir una puerta es nativo y en captura,** no un `onClick` de React: los disparadores llegan por portal y sus eventos burbujean por el árbol de React. No detiene el clic.
15. **La caja `.site-header__menu` se monta siempre** (con `display: contents` donde no es superficie). Si se pierde, ContactSection pinta su disparador dentro de la página.
16. **Lo que se aparta con el menú usa `visibility`, no `display: none`:** el pie y el consentimiento repetirían su animación de entrada. El burger sí usa `display: none` con un panel abierto.
17. **El menú lee el movimiento reducido al cerrar** (`prefersReducedMotion()`, instantánea del documento), y el CSS reacciona en vivo. Si la preferencia cambia a mitad de sesión, la fase dura más que la transición; nunca al revés.
18. **Ninguna página lleva `viewport-fit=cover`** (`index.html`, `blog.html`, `404.html`): en iOS todos los `env(safe-area-inset-*)` valen 0 y los `max(12px, env(…))` caen al mínimo. Debe llegar junto con el relleno que habilita, no antes.
19. **Las esquinas redondeadas de la tarjeta dependen de que `overflow: hidden` recorte una capa WebGL bajo una transformación 3D,** y iOS Safari puede ignorarlo. El blog lleva `isolation: isolate` en `.blog-surface`; la escena no. Sin probar: los proyectos móviles de Playwright son Chromium.
20. **El menú del móvil ya no es un campo de vidrio:** desde el 2026-09-16, también en el blog, la página es la tarjeta que se mueve. Su CSS está en `siteMenu.css` (`.site-menu-viewport`), no en `styles.css`. Lo que hable del «glass field» o del plan 011 es historia.

## Vidrio y color

21. **`styles.css` no llega al blog.** Un token o regla compartida va en `siteHeader.css`; las hojas de componentes que montan en el blog se importan desde su componente.
22. **El blog hereda los tokens oscuros y no debe consumirlos.**
23. **Hay literales de color en hojas de panel** (`consentBanner.css`, `auditSection.css`, `styles.css`, el velo de Contacto) y no reaccionan al bloque `@supports` sin desenfoque. Pendiente de decidir (ver [uso del azul](../decisiones/interfaz/uso-del-azul.md)). Sin test.
24. **La bandeja del holograma de Earth (`panel.glass*` en `orbitConfig.ts`) repite a mano la densidad A.** Si cambias `--glass-bg-light` o `--glass-border`, cámbiala también ([holograma de marca](../decisiones/earth/holograma-de-marca.md)). Sin test.
25. **No pongas `scrollbar-width` ni `scrollbar-color` en un componente:** Chromium dejaría de aplicar `::-webkit-scrollbar` y volverían las flechas en Windows. Un panel redondeado con scroll fija `--scrollbar-inset` a su radio.
26. **`backdrop-filter` sin prefijo no desenfoca en iOS 15–17.** Cada uso lleva `-webkit-backdrop-filter` y una placa con alfa que se lea sin desenfoque.
27. **El texto de un campo nunca baja de 16 px,** o iOS amplía la página al enfocar y la escena no se puede volver a pellizcar. Fija: solo la búsqueda del blog (`e2e/mobile.spec.ts`).
28. **`@keyframes site-header-breath` no lo usa nadie** (`siteHeader.css`): código muerto, no una pista.

## Tipografía

29. **Nunca declares una familia con el nombre de la fuente** (`Inter`, `Switzer`): en caliente, `blog.css` vive en el documento de la escena. Fija: `e2e/blog.spec.ts`. Ver también [blog](blog.md), n.º 26.
30. **Un canvas no hace que el navegador descargue una cara declarada:** pídela con `document.fonts.load` y repinta cuando llegue (`mediaFacade.ts`, `blogOrbitRing.ts`).
31. **Mide las alturas de mayúsculas sobre la H, no en la tabla OS/2:** Gambetta trae ahí la altura de x.
32. **El atlas de marcas de Earth dibuja en `system-ui`:** su cara cambia según la plataforma; mide con `measureText` y no compares capturas de texto entre plataformas.
33. **Quitar Switzer o Inter del respaldo deja las flechas (← → ↑ ↓) sin cara.** Decide antes de dónde salen.
34. **Un archivo nuevo en `public/fonts/` lleva los 8 primeros hexadecimales de su SHA-256 en el nombre** (`immutable`), y su precarga, `crossorigin`. Sin test.
35. **La pista de escena no lleva `font-family` a propósito:** hereda el rol de texto (hoy Gambetta). Una familia propia la separaría de la página. El reparto de caras es definitivo: ver [tipografías](../decisiones/interfaz/tipografias.md).

## Capas

36. **`.murcia-ui` ocupa toda la pantalla con `pointer-events: none` y sus hijos lo recuperan.** Sin eso se pierde el arrastre en LOS DOS mundos.
37. **La lista «Layer stack» de `styles.css` está incompleta:** le faltan la brújula, el campus, la pista, la cabecera del blog y la cubierta de entrada al blog. Actualízala al tocar un `z-index`.

## Cursor y picking

38. **Escribir `style.cursor` no se ve:** con el cursor propio, `cursor: none !important` se aplica a todo. Pide el estado al `CursorManager` de tu experiencia. Fija: `panelPointer.test.ts`.
39. **No crees un segundo `CursorManager` en el mismo canvas:** vuelve el parpadeo. Usa el de tu experiencia con una clave `fuente:instancia`. Sin test.
40. **`PRIORITY` solo decide de verdad entre `'grabbing'` y `'pointer'`.** Una fuente que no está en la tabla vale 0 (hoy `campus:*` y `murcia:blog-display`); `district` y `marker` son restos de módulos borrados. Sin test del árbitro.
41. **Una experiencia que se desactiva retira sus peticiones en ese momento,** porque el `update()` que las retiraría deja de correr. Una fuente nueva en Earth se retira también en ese camino. Fija: tests de `campusInteraction` y `panelPointer`; Earth sin test.
42. **Los glifos no tienen archivo fuente:** los SVG originales nunca se han versionado; el `d` de `CustomCursor.tsx` es la única copia. No restiles a silueta blanca ni quites `fill-rule: nonzero`.
43. **Un tap no produce `pointermove`:** una acción que lea un hover guardado no funciona en táctil, sin error. Pica con las coordenadas del evento.
44. **Las tolerancias de tap son dos números por tipo de puntero; nunca las juntes.** En Murcia, `dragThresholdPx` es la tolerancia de TAP del ratón. La cita a «`check:navigation` §12» de los documentos antiguos ya no existe.
45. **Un dedo se resuelve donde aterrizó; el ratón, donde se suelta** (`campusInteraction.ts`). En la pantalla del blog deben caer sobre el objetivo los dos extremos ([blog](blog.md), n.º 15).
46. **La pulsación recuerda lo que era cierto al empezar:** un tap que cierra algo sigue disparando `pointerup`. `panelPointer` guarda `blocked` en la pulsación y `sheetDrag` se traga el clic sintético tras un arrastre. Fija: `panelPointer.test.ts` («refuses a gesture that started while something else held attention»), `CasePanel.test.tsx` («…ignores the following pointer click»).
47. **El raycaster no mira `visible` y nadie usa `layers`.** Se pica contra listas explícitas: Earth comprueba `visible` a mano y pica solo `hitTarget`; la pantalla del blog descarta invitaciones ocultas por sus padres. Lo que no debe interceptar lleva `raycast = () => {}` (terreno, geotags, carcasa de la pantalla, cono, panel y cue de los satélites); una sonda de cobertura tiene que restaurarlo. Fija: `panelPointer.test.ts` («ignores an invitation hidden by its parent during the transition»).
48. **Pasa a NDC con `clientToNdc` y el rectángulo del CANVAS,** no con `innerWidth`: una Y invertida da aciertos equivocados que cerca del centro parecen buenos. `panelPointer.ts` aún hace la cuenta a mano. Fija: `screenSpace.test.ts`.
49. **Emular táctil exige un perfil de dispositivo:** con `hasTouch: true` solo sigue siendo `hover: hover`. Los proyectos móviles de `playwright.config.ts` son Chromium con perfil; WebKit no se prueba nunca.
50. **Los satélites no tienen camino de teclado, a propósito** ([picking por coordenadas](../decisiones/interfaz/picking-por-coordenadas.md)). No es deuda.

## Casos

51. **Una gráfica sin valores, o con uno no finito, no lanza error: no dibuja nada.** El build lo valida y `CaseChart` lo vuelve a comprobar; no quites ninguna guarda. Fija: `caseStudies.test.ts`.
52. **Barras o donut sin etiquetas no fallan: se dibujan mal.** Por eso el build exige una etiqueta por valor. Fija: `caseStudies.test.ts`.
53. **El panel del caso pinta desde `shown`, no desde `data`.** Un bloque nuevo que lea `data` se vacía al empezar el fundido de salida, y si no reserva su altura, el panel salta. Fija en parte: `CasePanel.test.tsx`.
54. **El color de marca va solo en las marcas de la gráfica** (`--case-brand`, `color-mix`). No lo lleves a la rejilla ni escribas un hex en el CSS: viene de Sanity. Solo visual.
55. **`CaseStudy.label` existe y nada lo dibuja** (el atlas dibuja `name`; `types.ts` lo marca «NOT CURRENTLY RENDERED»). Está oculto en el Studio. No lo uses creyendo que se ve.
56. **Los casos de los fixtures son de relleno:** ver [contenido](contenido.md), n.º 25.

## Datos de marca

57. **Los datos de marca y contacto se leen a través de `src/content/site.ts`,** un adaptador sobre el singleton generado (`SITE_SETTINGS[0]`, leído sin comprobar porque el build garantiza un documento) que conserva los nombres de exportación antiguos. Hoy es el único lector de `generated/siteSettings`, y ningún check lo impone. Los textos legales ya no están ahí (`src/content/legal.ts`). Ver [diálogo de contacto](../decisiones/formularios/dialogo-de-contacto.md) y [Sanity y la proyección GROQ](../decisiones/contenido/sanity-y-proyeccion-groq.md). Fija: `src/content/site.test.ts`.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Cabecera, portales, fases del menú | `SiteHeader.test.tsx`, `CornerLogoLayer.test.tsx`, `protoMenu3d.test.ts` |
| Blog y Servicios | `SceneShortcuts.test.tsx`, `useSceneShortcuts.test.tsx` |
| Menú y logo en el navegador | `e2e/mobile.spec.ts`, `e2e/shared-menu.spec.ts`, `e2e/navigation.spec.ts`, si se pide e2e |
| Campos | `ContactSection.test.tsx`, `AuditSection.test.tsx` |
| Tipografía del blog en caliente | `e2e/blog.spec.ts`, si se pide e2e |
| Vidrio, azul, tokens | búsquedas: `:root` fuera de `siteHeader.css`, `--glass-` en `blog.css`, `--accent`/`#1c67ff` fuera de su lista, `backdrop-filter` sin `-webkit-` |
| Cursor | tests de `campusInteraction` y `panelPointer`; con ratón, entrar y salir de Murcia con un hover activo y abrir y cerrar el blog |
| Picking y tolerancias | `npm run check:earth` (§7), `campusInteraction.test.ts`, `panelPointer.test.ts`, `screenSpace.test.ts` |
| Gráficas | `caseStudies.test.ts`, `CasePanel.test.tsx`, `content/collections/collections.test.ts`; inspección de los cuatro tipos |
| Datos de marca | `src/content/site.test.ts` |
| Inspección visual | menú en un teléfono (`?menu3d=1&…` en depuración), glifos sobre el cielo y sobre el panel del caso |

**Sin cobertura:** contraste del burger y de Contacto sobre Murcia; iOS Safari (tarjeta, área segura, desenfoque); tokens y literales de color; bandeja del holograma frente a `siteHeader.css`; hash y `crossorigin` de las fuentes; 16 px en los formularios; orden de la pila de capas; `cursorManager.ts` y `CustomCursor.tsx`; un tap táctil sobre un satélite en Earth.

## Posibles defectos

- **El burger de la escena en móvil mide 32×3 px con sombra y el del blog 44×4** (`siteHeader.css`). No es intencionado: es un error de implementación; arreglarlo es una tarea de código aparte.
- **Falta `viewport-fit=cover`** en las tres páginas (n.º 18).
- **El lápiz recibe tolerancias distintas según dónde toque:** la del ratón en Earth (`dragPointerType === 'touch'`) y en el campus (`pointerType === 'touch'`), la del dedo en la pantalla del blog (`pointerType !== 'mouse'`).
- **Un donut con más de cuatro segmentos no se ve entero:** la opacidad baja con cada segmento hasta desaparecer (fórmula en `CaseChart.tsx`), y el build admite hasta `chartValues` valores.
- **`CaseStudy.label` se declara, se proyecta y se valida sin lector** (n.º 55).
- **Sobre los campos de texto se ve la mano señaladora y no el cursor de texto:** `INTERACTIVE_SELECTOR` incluye `input` y `textarea`.
- **`blog.html` declara `theme-color` de papel (`#fbfbfa`) con la barra negra.**
- **`PRIORITY` conserva `district` y `marker`, de módulos borrados** (n.º 40); quitarlos es una tarea de código aparte.
