# El editor decide todo lo que pasa por Sanity; el código, nunca

**Estado:** vigente · **Desde:** 2026-08-20 (§28); reformulada el 2026-10-20 por indicación del usuario, tras las revisiones de 2026-09-11 (`9e041c5`, color de partículas), 2026-09-18 (`2c096e9`, órbitas derivadas del contenido), 2026-09-21 (`3e20535`, formas de los servicios) y 2026-09-23 (`f600914`, `<head>` y favicon) · **Sustituye a:** DECISIONS §28; ADR 010 («Which case study occupies which orbit…»); ADR 011 («Scene composition stays code-owned»)

## Decisión

1. **Lo que pasa por Sanity lo decide el editor.** No son solo textos: también decisiones de contenido visual. Hoy, entre otras:
   - las partículas del área de Servicios: el símbolo, la figura y el color de cada servicio y el color del distrito (`symbol`, `figure`, `particleColor`);
   - qué servicios forman la sección y en qué orden;
   - qué caso de estudio está resaltado (`highlighted`, exactamente uno), y con él qué caso ocupa cada órbita (ver [satélites](../earth/satelites.md));
   - las marcas, el color de marca y las gráficas de cada caso;
   - los textos, las cifras y las imágenes de la [pantalla de la torre](pantalla-de-la-torre.md);
   - el `<head>` de `/` y `/blog` y el favicon.
2. **El editor nunca decide código ni nada de desarrollo.** Son del código, y cambiarlos es un cambio revisado:
   - las listas cerradas entre las que el editor elige (`CAMPUS_SYMBOLS` y `CAMPUS_FIGURES` en `src/content/campusShapes.ts`). Una forma nueva es desarrollo, porque alguien tiene que dibujarla;
   - el conjunto de huecos y su sitio: qué órbitas hay y en qué orden se llenan (`HIGHLIGHTED_ORBIT_ID`, `ORBIT_FILL_ORDER` en `src/experiences/earth/orbit/orbitAssignments.ts`), qué nodos del GLB son un distrito (`contentId` en `src/experiences/murcia/scene/cityDistrictBindings.ts`), qué documentos legales existen (`LegalDocId` en `src/content/site.ts`) y dónde se pinta cada hueco de la torre (`layoutTowerSlides.ts`);
   - posiciones, nombres de nodos de Blender, cámara, rectángulos de mundo y archivos 3D. Nada de eso existe en Sanity.
3. **Las relaciones que no cuadran hacen fallar el build**, nunca se resuelven adivinando: referencias sin resolver, más o menos de un caso resaltado, un distrito sin enlace en la escena, un documento legal que falta.
4. **Lo que el editor elige se valida antes de publicar.** El Studio solo ofrece las opciones que el código sabe dibujar y bloquea lo que el build rechazaría (ver [límites editoriales](limites-editoriales.md)).

## Por qué

El cliente necesita cambiar lo que se ve sin pedir un despliegue de código, y los editores no tienen perfil técnico. Las tablas en código que reflejaban el contenido fallaron dos veces: la de órbitas tumbó el arranque el día que no coincidió con lo publicado (2026-09-18), y la de formas por servicio dejó cuatro servicios dibujando figuras de un texto que ya no existía (2026-09-21). Y el emparejamiento posicional entre casos y órbitas que había antes de §28 podía mostrar en silencio las métricas de un cliente bajo el nombre de otro; por eso la asignación se deriva y se valida.

## Qué se descartó

- «El CMS solo pone el texto»: la formulación anterior de §28, que ya no describía el sitio.
- Un campo `orbitId` editable en el CMS.
- La tabla literal de casos en `orbitAssignments.ts` (hasta `2c096e9`).
- Las filas de símbolo y figura por servicio en `cityDistrictBindings.ts` (hasta `3e20535`).
- `<title>`, descripción y OG fijos en `index.html` y `blog.html` (hasta `f600914`).

## Se ha roto si…

- Una relación que no cuadra se resuelve con «el primero gana» o «descartar y avisar». Fija: `content/collections/collections.test.ts`, `src/content/generated.test.ts` (`highlightedCaseProblems`).
- El build acepta una forma que el campus no sabe dibujar. Fija: `content/collections/collections.test.ts` («a symbol or a figure the campus cannot draw»). Las opciones del Studio salen de las mismas listas (`sanity-studio/schemas/service.ts`); una forma nueva sin título en el Studio la detecta `npm run check:studio`, solo con el Studio instalado.
- Aparece en un esquema del Studio un campo de posición, nodo o cámara (revisión humana).
- Un cambio visual que el editor puede hacer en Sanity se resuelve en código, o al revés (revisión humana).

## Afecta a

`src/content/campusShapes.ts`, `src/content/site.ts`, `src/experiences/earth/orbit/orbitAssignments.ts`, `src/experiences/murcia/scene/cityDistrictBindings.ts`, `content/collections/caseStudies.collection.ts`, `content/collections/districts.collection.ts`, `content/collections/services.collection.ts`, `content/collections/siteSeo.collection.ts`, `sanity-studio/schemas/lib/orbitCapacity.ts`, `sanity-studio/schemas/lib/serviceMembership.ts`, `sanity-studio/schemas/lib/highlightedCase.ts`
