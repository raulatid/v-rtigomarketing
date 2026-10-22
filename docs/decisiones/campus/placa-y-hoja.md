# El texto del servicio: placa al lado en escritorio, hoja de dos paradas en el móvil

**Estado:** vigente · **Desde:** 2026-09-11 (`f549c22`, vidrio; `c050313`, placa al lado); hoja del móvil desde el 2026-09-15 (`e8207d7`), con la revisión del cliente del 2026-09-16 (`1dbcf5a`, `24829d7`); parada compacta derivada desde el 2026-09-21 (`2e17a5f`); arrastre y scroll estabilizados el 2026-09-22 (`b48a0ef`); placa acotada al viewport desde el 2026-09-26 (`63f9fda`) · **Sustituye a:** DECISIONS §45 (en parte: punto 4, «A visible close», y su enmienda del 2026-09-16)

## Decisión

1. **El texto es DOM real** (`section/campusOverlay.ts`), montado en el host de interfaz de Murcia sobre el [vidrio ahumado](../interfaz/vidrio-ahumado.md) de densidad B. El título va en la cara de títulos ([tipografías](../interfaz/tipografias.md)). Su capa: [pila de capas](../interfaz/pila-de-capas.md).
2. **Lo que lleva la placa:** la flecha de vuelta, arriba a la izquierda; título; subtítulo; descripción; puntos destacados; en la intro, la pista de `campusLabels.ts`; las flechas anterior y siguiente. El rótulo «Qué medimos» no se muestra.
3. **El texto cambia con un fundido** (`FADE_MS`): sale, se cambia y entra; nunca cambia mientras se lee. Aparece cuando terminan el vuelo y el morph del paso; los puntos destacados, después (ver [figuras](figuras-que-argumentan.md)). Oculta, la capa además pasa a `visibility: hidden`, para que sus botones no recojan pulsaciones.
4. **En escritorio y en tableta apaisada** (`CAMPUS_DOCK_QUERY`, la misma cadena que la media query de `murcia.css`), la placa va a la izquierda, en la franja entre la cabecera y el borde inferior, sin salirse de ella:
   - si no cabe, solo la descripción se encoge y hace scroll, con un fundido; flecha, título, puntos y flechas de paso se quedan;
   - en las pantallas más bajas, hace scroll la placa entera;
   - la capa deja pasar el puntero a la ciudad, salvo en los botones y en lo que hace scroll.
5. **En el resto (móvil, tableta vertical), una hoja inferior de dos paradas**, compacta y expandida (`section/campusSheet.ts`, sobre `src/interaction/sheetDrag.ts`):
   - la parada compacta es la mayor que no aleja las partículas (`campusCompactFraction`), entre `CAMPUS_COMPACT_MIN_FRACTION` y `CAMPUS_COMPACT_MAX_FRACTION`. Se publica en `dvh` como `--campus-sheet-compact` y se recalcula al redimensionar;
   - la expandida mide lo que mide el texto, con el tope de `max-height` en `murcia.css`;
   - si todo el texto cabe en la compacta, la hoja se abre entera y el asa desaparece;
   - solo el asa arrastra; el cuerpo hace scroll vertical nativo;
   - el asa es una píldora sin texto, nombrada solo por su `aria-label`;
   - la flecha de vuelta dibuja una marca más pequeña dentro del mismo objetivo táctil;
   - el título va centrado y, debajo, una columna centrada de texto alineado a la izquierda, con una medida máxima;
   - la hoja recoge el puntero: un arrastre sobre ella no llega al campus.

   La hoja equivalente de Earth está en [panel del caso](../earth/panel-del-caso.md).
6. **Cada cambio de parada devuelve la hoja a la compacta** (`reset()` al ocultar) y vuelve a medir el texto.
7. **La placa la comparte la [sección Conócenos](../murcia/seccion-conocenos.md)**, con dos añadidos opcionales que el campus no usa:
   - **acciones** (`actions` en `OverlayCopy`: etiqueta, variante y callback), una fila de botones bajo el texto. La variante `primary` lleva el azul del CTA ([uso del azul](../interfaz/uso-del-azul.md)); `secondary` es vidrio neutro. Estilos: `.campus-overlay__actions` en `murcia.css`;
   - **una clase modificadora** (`className`), para que la hoja de estilos la coloque de otra manera: Conócenos la acopla a la derecha (`.campus-overlay--about`).

   `hasPrevious` y `hasNext` desactivan la flecha de paso hacia ese lado, en la primera y la última parada de una fila que no da la vuelta.

## Por qué

- DOM y no textura: el texto tiene que verse nítido a cualquier tamaño (`campusOverlay.ts`).
- Vidrio B: un texto sobre la escena es el trabajo que hace el panel del caso en Earth (`f549c22`).
- Al lado: la tarjeta tapaba las partículas en todas las pantallas (`c050313`).
- Acotada: en portátiles de pantalla baja, los servicios largos se salían por arriba y por abajo, y se llevaban la flecha de vuelta y las de paso (`63f9fda`).
- Parada compacta derivada: la fracción fija tenía que servir en el móvil más pequeño, y en los demás dejaba sin usar un sitio que la hoja podía ocupar sin achicar las partículas (`2e17a5f`). El tope es un juicio: media pantalla de hoja sobre un lago es otra composición (`campusMobileLayout.ts`).
- Asa sin texto, marca pequeña y columna centrada: revisión del cliente en un móvil, 2026-09-16 (`1dbcf5a`).
- Hoja a la medida del texto: con altura fija, un servicio corto era casi todo vidrio vacío (`24829d7`).
- La flecha visible existe porque un móvil no tiene Escape (§45).

## Qué se descartó

- La tarjeta centrada sobre las partículas del laboratorio. Sigue en el código para el laboratorio, sin `hostLayout`.
- El «[+]» y el cierre a su lado (§45, punto 4).
- El asa con texto visible.
- Una hoja de altura fija y una parada compacta fija.
- Recortar líneas del subtítulo con `-webkit-line-clamp`: eran reglas muertas (`5271246`).

## Se ha roto si…

- Falla `section/campusSheet.test.ts` («does not treat the click following a drag as a second toggle», «preserves the compact reading position on resize and remeasurement», «withdraws the grip and opens in full when the copy fits the compact stop»).
- Falla `campusMobileLayout.test.ts` («stays inside its bounds, and never lowers a sheet to buy particles»).
- Falla `section/campusOverlay.test.ts`.
- El arrastre y el scroll reales en navegador los prueba `checks/campus-sheet.mjs`, que no ejecuta ningún script de `package.json` y hoy falla (ver [trampas de build](../../trampas/build.md)). No hay cobertura que pase.
- La placa se sale del viewport o se cruza con el disco: sin test; se mira en portátiles de pantalla baja y en un escritorio ancho.
- Solo si se pide e2e: `e2e/mobile.spec.ts` busca la flecha `.campus-overlay__back`.

## Afecta a

`src/experiences/murcia/campus/section/campusOverlay.ts`, `src/experiences/murcia/campus/section/campusSheet.ts`, `src/experiences/murcia/about/createAboutSection.ts`, `src/experiences/murcia/campus/campusMobileLayout.ts`, `src/interaction/sheetDrag.ts`, `src/experiences/murcia/styles/murcia.css` (bloque «The services campus copy»), `src/experiences/murcia/campus/createServicesCampus.ts`, `src/experiences/murcia/campus/campusLabels.ts`, `checks/campus-sheet.mjs`
