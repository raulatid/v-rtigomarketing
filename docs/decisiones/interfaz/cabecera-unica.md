# Una sola cabecera en todas las superficies

**Estado:** vigente · **Desde:** 2026-09-03 (`da319e6`); Contacto blanco sobre un velo en la escena desde el 2026-09-04 (`e4d4cd2`); barra negra del blog desde el 2026-09-05 (`ae12e18`); logo más alto (`--header-logo-height` en `siteHeader.css`) y sonido abajo en móvil desde el 2026-09-15 (`f6e4c8c`); el logo de la ciudad vuelve a la Tierra desde el 2026-09-16 (`a15a46c`) · **Sustituye a:** la enmienda del 2026-09-03 de DECISIONS §26.16 y el párrafo «The blog's bar is black» de §36

## Decisión

1. **`SiteHeader` es la única cabecera:** Earth, Murcia, el blog (frío y caliente) y el 404. Es un armazón de maquetación (inicio · marca · cola y, en móvil, el burger); los controles no son suyos. Nada de ella es interactivo hasta `site` (ver [nada interactivo hasta `site`](../intro/nada-interactivo-hasta-site.md)).
2. **Los disparadores entran con un portal.** `AuditSection`, `ContactSection` y `SceneShortcuts` pintan su botón en `.site-header__end` (`triggerHost`) y conservan su foco de retorno, su `data-state` y sus tests. El blog monta sus propias instancias (`BlogSurface.tsx`).
3. **La línea de la cabecera es la única fuente de su geometría:** `--header-inset`, `--header-control` y `--header-line-top` en `siteHeader.css`. `CornerLogoLayer` mide `.site-header__row` de la cabecera de la escena para colocar y escalar el logo 3D (en móvil, `--header-logo-height`). Ninguna de esas cifras se repite en TypeScript.
4. **Sobre la escena es transparente y no recibe eventos;** solo sus controles. Va por encima de la cortina de auditoría y de los diálogos.
5. **En el blog es una barra negra, en un solo selector** (`.site-header[data-layout='blog']`), con `tone="dark"`. Va por debajo de la cortina y de los diálogos, porque es opaca. La marca 3D de esa barra es [otra decisión](../blog/marca-3d-en-la-cabecera.md).
6. **`tone` dice cómo de claro es el fondo.** Sobre fondo claro, Contacto, Blog y Servicios van en tinta. En la escena de escritorio, sobre Murcia, van en blanco sobre un velo de vidrio, acotado por `data-layout='scene'` y no por `tone`. La caja de Auditoría lleva su propio color en todas partes.
7. **En Murcia, la celda de inicio es «Volver a la Tierra»** (`.scene-home`: el elemento en `App.tsx`, el estilo en `siteHeader.css`): activa solo en la vista general de la ciudad (`isCityOverview`) y con la atención libre.
8. **La cabecera de la escena publica el ancho de su cola** en `--site-header-tail`, para que la [brújula](../murcia/brujula.md) se centre.
9. **El interruptor de sonido** va en la cola en escritorio; en móvil queda fijo abajo a la izquierda, junto al ⓘ de cookies.

## Por qué

- Con dos cabeceras, sus cifras se separaban y el logo crecía con la ventana mientras los botones no. Una línea medida hace de logo y botones una sola composición.
- Barra negra y Contacto blanco: indicación del cliente. Sin velo, el blanco sobre el cielo de Murcia no tiene contraste suficiente; con el velo, sí (las medidas están en el comentario «White over the scene» de `siteHeader.css`). En móvil el blanco empeoraba la lectura.
- «Volver a la Tierra» desde el logo: decisión del cliente y del usuario.

## Qué se descartó

- Una cabecera por superficie, y la prop `active` con cierre forzoso de las secciones.
- Un margen propio para el logo 3D.
- Blanco sin velo sobre Murcia, una píldora como velo y un velo escrito contra `tone`.

## Se ha roto si…

- Fallan `src/components/SiteHeader.test.tsx` («where the box lives») o `src/corner-logo/CornerLogoLayer.test.tsx`.
- En e2e fallan `e2e/mobile.spec.ts` («the header stays put while the case scrolls») o `e2e/navigation.spec.ts` («city logo returns to Earth at viewport width …»).
- El logo y los botones dejan de compartir línea, o aparece una cifra de la cabecera en TypeScript (revisión; sin test).
- Contacto pierde contraste sobre Murcia en escritorio (sin test).

## Afecta a

`src/components/SiteHeader.tsx`, `src/components/siteHeader.css`, `src/corner-logo/CornerLogoLayer.tsx`, `src/App.tsx`, `src/blog/BlogSurface.tsx`, `src/notFound/NotFoundPage.tsx`, `src/components/AuditSection.tsx`, `src/components/ContactSection.tsx`, `src/experiences/murcia/styles/murcia.css`
