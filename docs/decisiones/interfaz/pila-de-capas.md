# La pila de capas tiene una sola lista, y el orden importa más que las cifras

**Estado:** vigente · **Desde:** 2026-08-07 (plan 002 §3); capas del menú desde el 2026-09-09; capa del h1 de la portada desde el 2026-11-22 (`0671eb7`), visible y con su vuelo desde el 2026-11-23 · **Sustituye a:** PROJECT_MEMORY §3, «Layer stack (z-index)» (archivado)

## Decisión

1. **La lista canónica es el comentario «Layer stack» de `src/styles.css`.** Quien añada o mueva una capa la actualiza ahí. Los comentarios de otras hojas (`auditSection.css`, `blog.css`) son resúmenes. Los valores viven en cada selector o constante (`Z_INDEX` en `campusOverlay.ts` y `handoffImage.ts`), no aquí.
2. **Reglas de orden que no se pueden invertir:**
   - la capa del [menú del móvil](menu-movil.md) queda **detrás** del canvas, porque la tarjeta la descubre;
   - el destello del warp cubre todo lo de la escena, también la brújula, para que el corte tape lo que desaparece;
   - la pista queda sobre el pie y bajo el control de navegación;
   - la cabecera de la escena queda sobre la cortina de auditoría y los diálogos (es transparente y solo sus controles reciben eventos);
   - la cabecera del blog queda bajo la cortina y los diálogos, porque es opaca ([cabecera única](cabecera-unica.md));
   - la cubierta de entrada al blog queda entre la cabecera y el blog, que la tapa cuando pinta;
   - el h1 de la portada (`.home-headline`, `homeHeadline.css`) queda sobre el canvas y la intro SVG, porque forma parte de la escena, y **bajo** el panel del caso y el destello del warp: el destello lo cubre como al resto de la escena. Nunca comparte pantalla con el panel del caso, la auditoría, los diálogos ni el menú del móvil: `App.tsx` (`headlineShown`) lo retira mientras están abiertos, durante el warp, en Murcia y antes de que salgan las órbitas. Esa retirada propia es con `opacity`, no con `visibility`, para que el encabezado de la página no salga del árbol de accesibilidad (con el blog delante lo oculta `.app__scene` con el resto de la escena). Desde el 2026-11-23 (bloque 9, I4) es visible en producción: un rótulo centrado bajo la línea de la cabecera, y sin variantes ni `?h1=`. Sus letras llegan volando desde una órbita grande alrededor del planeta (`HeadlineFlightLayer`, en el chunk de la escena): son copias sueltas `aria-hidden` dentro de `.home-headline`, en su misma capa, y mientras vuelan el h1 real y su frase esperan con `opacity` 0 (`data-flight`), así que el encabezado sigue en el árbol de accesibilidad;
   - el cursor queda por encima de todo, también de la depuración.
3. **Las capas a pantalla completa que no son controles no reciben eventos** (`.murcia-ui`, `.site-header` en la escena, `.audit-overlay`, `.site-menu-stage`); sus hijos los recuperan. El h1 de la portada tampoco, ni sus hijos: un arrastre que empieza sobre una letra sigue girando el globo.
4. **Los envoltorios de landmark no tienen caja propia.** `<main className="app__main">` (`App.tsx`, desde el 2026-11-23, auditoría de accesibilidad D4) envuelve el h1, el escenario del canvas, la lista y el panel de casos sin `transform`, `z-index` ni `position`: así cada hijo fijo conserva el viewport y el orden de apilamiento. El menú del móvil (`SiteMenuLayer`) va antes y fuera de él, porque es la navegación del sitio. El canvas se nombra con `role="img"` y `aria-label` en el propio `<canvas>` (`SCENE_LABEL` en `SceneCanvas.tsx`), nunca en el envoltorio de R3F, que también contiene los controles de Murcia.

## Por qué

Cada relación nació de un fallo concreto: barras que se veían a través de un panel, un aviso que tapaba el destello, una barra opaca que tapaba la flecha de vuelta de la auditoría. La lista solo vale si hay una sola.

## Qué se descartó

Las etiquetas geográficas en su propia capa (se fueron con los marcadores el 2026-08-19) y el burger dibujado en el canvas, bajo los paneles.

## Se ha roto si…

- Falla `src/experiences/murcia/blogDisplay/handoffImage.test.ts` (la cubierta entre la cabecera y el blog).
- Un arrastre sobre la escena deja de funcionar en los dos mundos: una capa a pantalla completa capturó los eventos (`e2e/navigation.spec.ts` lo nota indirectamente).
- El resto, solo a ojo. Hoy la lista de `styles.css` está incompleta (ver [trampas](../../trampas/interfaz.md)).

## Afecta a

`src/styles.css`, `src/components/siteMenu.css`, `src/components/siteHeader.css`, `src/components/homeHeadline.css`, `src/components/auditSection.css`, `src/components/modal.css`, `src/components/consentBanner.css`, `src/experiences/murcia/styles/murcia.css`, `src/experiences/murcia/campus/section/campusOverlay.ts`, `src/experiences/murcia/blogDisplay/handoffImage.ts`, `src/intro-draw/introDraw.ts`, `src/blog/blog.css`, `src/notFound/notFound.css`
