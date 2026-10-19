# La brújula de Murcia

**Estado:** vigente · **Desde:** 2026-09-10; aspecto actual desde 2026-09-15 · **Sustituye a:** DECISIONS §44 (brújula y sus enmiendas) y la parte de §37 que le atañe

## Decisión

1. **Una barra que indica hacia dónde quedan los lugares en los que se puede hacer clic**, desde cualquier rumbo. Existe porque con el modelo de un solo puntero es fácil girar y perder de vista el distrito.
2. **Los rumbos se calculan en el plano del suelo**, no en el espacio de cámara: un rumbo en cámara se movería al cambiar solo la inclinación, y la inclinación cambia a lo largo de la banda de zoom.
3. **Un lugar «llega» solo si está a la vez cerca del centro de la barra y cerca en el mundo.** Estar apuntando a algo no es haber llegado.
4. **Etiquetas que no se pisan.** `placeLabels` dibuja solo la de mayor prioridad cuando dos chocan (con histéresis) y mete hacia dentro la que queda cerca de un extremo. Los anchos llegan por `ResizeObserver`; nada se lee del layout en cada fotograma.
5. **Posición:** sobre la línea de la cabecera, entre sus dos extremos, despejando el ancho que publica la cabecera en `--site-header-tail`. Si no queda sitio suficiente (`--murcia-compass-min`), cuelga justo debajo de la línea.
6. **Aspecto:** todo en blanco a las intensidades de texto del sitio; el azul solo en el borde de la bandeja de vidrio (densidad A de §37). Sin resplandores ni amarillo: `DESIGN.md` descarta el estilo HUD.
7. **No es un control:** `pointer-events: none` y `aria-hidden`. La ruta accesible es `DistrictA11y`.

## Qué se descartó

- La brújula azul y amarilla del laboratorio, con halos (2026-09-10 y 2026-09-11): se leía como el HUD de un juego.
- Las balizas de llegada sobre el distrito y el blog (`districtBeacons.ts`), retiradas el 2026-09-10.
- La brújula que sigue al cursor (`70424f5`, revertida en `9e47ae6`). Se conserva entera en la rama `cursor-compass`.

## Se ha roto si…

- Fallan `compassBar.test.ts` o los tests de `src/utils/compass.ts` (`placeLabels`, `arrivalEdge`).
- La brújula tapa algún control de la cabecera en algún ancho (inspección visual entre 768 y 1200 px y en móvil).

## Afecta a

`src/experiences/murcia/ui/compassBar.ts`, `src/utils/compass.ts`, `src/experiences/murcia/styles/murcia.css`, `src/components/SiteHeader.tsx` (`--site-header-tail`)
