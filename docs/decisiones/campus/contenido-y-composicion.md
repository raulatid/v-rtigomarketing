# Qué del campus viene de Sanity y qué es composición de escena

**Estado:** vigente · **Desde:** 2026-09-11 (`a7b4a3e`); colores de partículas en Sanity desde el 2026-09-11 (`9e041c5`); formas en Sanity y lista de servicios libre desde el 2026-09-21 (`3e20535`); la descripción vuelve a verse desde el 2026-09-21 (`5271246`) · **Sustituye a:** DECISIONS §45 (en parte: punto 2, «No Sanity change»)

## Decisión

1. **Del documento `district`** («Sección de servicios» en el Studio; hay uno):
   - `label`: el título de la intro y el nombre del lugar en la brújula;
   - `summary`: la línea bajo ese título;
   - `particleColor`: el color del disco de la intro y el de todo servicio que no tenga el suyo. Vacío, `DEFAULT_PARTICLE_COLOR` (`src/content/editorialBounds.ts`);
   - `services`: qué servicios son paradas y en qué orden. Añadir, quitar y reordenar es del editor, con el tope `EDITORIAL_BOUNDS.district.services`.
2. **De cada `service`:** `title`, `body`, `symbol` y `figure` (ver [figuras](figuras-que-argumentan.md)), `measures` y `particleColor`.
3. **Cómo se parte `body`** (`buildServicesContent` en `campusContent.ts`, con `district/serviceCopy.ts`):
   - si el primer párrafo tiene un salto de línea, es el subtítulo tal cual (las dos líneas que pide el Studio); si no, el subtítulo es el resumen de `splitServiceCopy`;
   - lo que sigue es la descripción, que se muestra debajo. Si no sigue nada, la descripción es el cuerpo entero.
4. **No se leen** `district.intro` (oculto en el Studio y aún exigido por el build) ni `figureCaption` (oculto; ver [figuras](figuras-que-argumentan.md)).
5. **Es del código, no del editor:**
   - qué documento muestra el campus: `contentId` en `scene/cityDistrictBindings.ts`, soldado al lago del GLB. Por eso el Studio no deja crear ni borrar el distrito;
   - el dibujo de los símbolos, en el bundle (`content/campusIcons.ts`); el editor elige por nombre;
   - los textos de la interfaz (botones, la pista de la intro, lo que anuncia la región viva), en `campusLabels.ts`, la única costura de idioma de la sección;
   - la frase de la tira LED (ver [tira LED](tira-led.md));
   - tiempos, tamaños, cámara, colores de las piezas y el blanco de las partículas.
6. **El documento entra entero o no entra.** `parseServicesContent` (`content/servicesContent.ts`) rechaza el conjunto si un servicio está mal o si hay ids repetidos. El build lo rechaza antes (`content/collections/districts.collection.ts`); en el navegador, el rechazo deja el campus como escenario.

## Por qué

- El cliente cambia lo que se ve sin desplegar código ([qué decide el editor](../contenido/que-decide-el-editor.md)). Colores y formas pasaron a Sanity por eso (`9e041c5`, `3e20535`).
- Los símbolos están en código porque un SVG del CMS se rechaza como archivo: nada que no sea de confianza se rasteriza (`iconLibrary.ts`).
- `contentId` está en código porque cambia cuando se reexporta el GLB, no cuando escribe marketing (`cityDistrictBindings.ts`).
- Todo o nada: un conjunto lo escribe una persona de una sentada, y descartar en silencio una entrada es como sale un error a producción (`servicesContent.ts`).
- La descripción volvió porque el editor veía desaparecer su texto: se había quitado de la placa dejando el campo, el parser y los estilos (`5271246`).
- Que la frase de la tira no siga a `label`: sin porqué registrado.

## Qué se descartó

- «Ningún cambio en Sanity» (§45). El subtítulo y la descripción siguen saliendo de `body`, pero colores, formas, puntos destacados y la lista ya son campos del editor.
- Un campo `summary` aparte en el servicio (`serviceCopy.ts`).
- Ocultar la descripción en la placa (`e495f51`, revertido en `5271246`).
- Un SVG subido por el editor.
- La lista de servicios bloqueada en el Studio (hasta `3e20535`).

## Se ha roto si…

- Falla `campusContent.test.ts` («never repeats the opening line in the detail», «keeps a one-sentence body whole rather than losing the section to it», «preserves the two editorial lines without joining or truncating them», «carries the entry's colour and each service's own into the particles», «rejects the set when a colour is not #rrggbb»).
- Falla `district/serviceCopy.test.ts`.
- Falla `content/collections/collections.test.ts` («resolve an empty district colour to the site blue, and an empty service colour to the district's», «a particle colour that is not #rrggbb, on the district or a service», «a district with no services, which would open to nothing», «duplicate service ids within one district»).
- Una lista de formas se escribe fuera de `campusShapes.ts`: ver [límites editoriales](../contenido/limites-editoriales.md).

## Afecta a

`src/experiences/murcia/campus/campusContent.ts`, `src/experiences/murcia/campus/content/servicesContent.ts`, `src/experiences/murcia/campus/content/iconLibrary.ts`, `src/experiences/murcia/campus/content/campusIcons.ts`, `src/experiences/murcia/campus/campusLabels.ts`, `src/experiences/murcia/district/serviceCopy.ts`, `src/experiences/murcia/scene/cityDistrictBindings.ts`, `src/content/campusShapes.ts`, `src/content/editorialBounds.ts`, `content/collections/districts.collection.ts`, `sanity-studio/schemas/district.ts`, `sanity-studio/schemas/service.ts`, `docs/content/sanity-field-contract.md`
