# El menú del móvil: la vista se pliega como una tarjeta y descubre el menú

**Estado:** vigente · **Desde:** 2026-09-09 (`e2bef6c`); burger blanco y al doble el mismo día (`f576ed8`); capa de grafito con frases de apoyo desde el 2026-09-15 (`6c9c353`); el blog usa el mismo menú desde el 2026-09-16 (`dfb43b6`); barras de 32 × 3 px en todas las superficies desde el 2026-10-20 · **Sustituye a:** las enmiendas de DECISIONS §26.16 del 2026-09-04 («glass field»), del 2026-09-08 y del 2026-09-09; la fila «The phone burger is four bars…» de «Superseded»

## Decisión

1. **Solo en móvil** (`PHONE_QUERY` en `SiteHeader.tsx`, el mismo corte que `siteHeader.css` y `siteMenu.css`). En escritorio las acciones se quedan en la línea de la cabecera.
2. **Abrir el menú mueve la vista, no el menú.** El contenido (en la escena, el canvas con todo lo que pinta, incluida la marca 3D, que viaja con la tarjeta; en el blog, la página) es una tarjeta rígida que baja, se aleja y bascula sobre su borde inferior. El menú es la capa que deja al descubierto. Cerrar es el movimiento inverso. Es igual en la escena y en el blog.
3. **Es CSS sobre envoltorios, no una cámara:** `SiteMenuStage` lleva la perspectiva y envuelve **solo** el contenido, `.site-menu-viewport` la transformación y `SiteMenuLayer` es la capa de detrás. La composición son propiedades `--menu-3d-*` en `siteMenu.css`; en builds de depuración, `?menu3d=1&…` las sobrescribe (`src/app/protoMenu3d.ts`).
4. **Un solo reloj:** `MENU_MOTION_MS` y `MENU_REDUCED_MS` (`src/corner-logo/headerMenuTiming.ts`) se escriben como `--menu-3d-ms`, así que la fase y la transición duran lo mismo.
5. **Tres fases, `closed · open · closing`,** en `SiteHeader`. «Abierto» dura todo el cierre: `attentionIsFree` (`App.tsx`) lo lee, la Escape global se aparta y ningún gesto inicia un warp con la escena inclinada. Un toque en el burger a mitad del cierre reabre desde donde esté la tarjeta.
6. **Elegir una puerta pliega el menú y la puerta se abre en el mismo tick** (listener nativo en captura que no detiene el clic). Escape o un toque fuera, también sobre la tarjeta, cierran sin abrir nada y devuelven el foco al burger.
7. **Mientras se mueve, la tarjeta no recibe punteros**, y el canvas tampoco (con `!important`, porque R3F escribe `pointer-events: auto` en línea).
8. **Nada se remonta ni se redimensiona:** `SceneCanvas` mide con `resize={{ offsetSize: true }}`.
9. **El resto de la interfaz de la escena se aparta con `visibility`** (`data-menu-open`), sin desmontarse, para no repetir sus entradas.
10. **El burger son tres barras que se convierten en ✕,** blanco en los dos mundos: es el único control que no sigue al cielo. Desaparece mientras está abierto un panel al que lleva, y va en el DOM antes que las acciones. Sus barras miden lo mismo en la escena y en el blog (`.site-header__burger-bar` en `siteHeader.css`); sobre la escena llevan además una sombra, por el cielo claro de Murcia.
11. **Lo que descubre la tarjeta:** fondo de grafito con luz reflejada estática; Auditoría y Contacto como texto grande, en la tipografía actual de `siteMenu.css`, cada uno con una frase de apoyo (`.site-menu-caption`) y una flecha; un separador neutro; debajo, [Blog y Servicios](atajos-blog-y-servicios.md). El orden sale de `order`.
12. **En el blog,** la página es `inert` mientras el menú no está cerrado.

## Por qué

- Un panel pequeño sobre una escena viva no bloquea los gestos: por eso «abierto» dura todo el cierre.
- `perspective`, como `transform`, convierte el elemento en el bloque contenedor de sus `position: fixed`: cabecera, paneles y diálogos deben quedar fuera del escenario.
- R3F mide con `getBoundingClientRect()`, que incluye la transformación; sin `offsetSize`, un resize con el menú abierto metería el rectángulo inclinado en el renderer.
- Burger blanco y al doble: indicación del cliente (llevó `--accent` una hora el 2026-09-09). La capa de grafito con frases y el menú compartido con el blog: decisión del cliente y del usuario. La marca 3D que viaja con la tarjeta y la tipografía de las puertas quedaron «a ojo» en su momento; el usuario las aprobó tal como están el 2026-10-20.

## Qué se descartó

- La hoja blanca (2026-09-03) y el campo de vidrio que bajaba desde la cabecera (en el blog, hasta `dfb43b6`).
- El burger de cuatro barras dibujado en el pase de overlay y las barras que volaban a formar un marco (`headerBurger.ts`, `cubicBezierEase`; revertidos).
- Una fase `opening`, la puerta diferida y el burger azul.

## Se ha roto si…

- Fallan `src/components/SiteHeader.test.tsx` (fases; «tells the parent the state for the WHOLE close») o `src/app/protoMenu3d.test.ts`.
- En e2e fallan `e2e/mobile.spec.ts` («the burger hinges the scene away…», «a tap on the card, Escape and the burger all close the menu…», «the doors sit in the band the card leaves free», «the burger opens the same menu, on paper») o `e2e/shared-menu.spec.ts`.
- Esquinas sin redondear en iOS (a ojo; ver trampas).

## Afecta a

`src/components/SiteHeader.tsx`, `src/components/SiteMenu.tsx`, `src/components/siteMenu.css`, `src/components/siteHeader.css`, `src/corner-logo/headerMenuTiming.ts`, `src/app/protoMenu3d.ts`, `src/components/SceneCanvas.tsx`, `src/App.tsx`, `src/blog/BlogSurface.tsx`, `src/blog/blog.css`, `src/styles.css`
