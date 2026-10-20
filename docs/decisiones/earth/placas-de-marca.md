# Las placas de marca: un suelo dibujado que los logos reales mejoran

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** DECISIONS §18 y su enmienda

## Decisión

1. **Dos atlas, uno por tipo de marca** (`AtlasKind`: isotipo y logo), con celdas por tipo y filas derivadas del número de casos.
2. **El suelo se dibuja de forma síncrona:** un monograma en anillo con el color de la marca (`safeBrandColor` si no lo hay) y un logotipo en texto con un color opaco (`WORDMARK_COLOR`).
3. **El arte real se carga en segundo plano:**
   - `crossOrigin` se fija antes que `src`, y una sonda de 1×1 comprueba que el canvas no quede contaminado;
   - la marca se ajusta a su tinta medida, no a su caja;
   - las subidas a GPU se agrupan en una por fotograma;
   - si falla, se queda el suelo y se avisa;
   - al liberar, se cancelan las cargas en curso.
4. **`orbits:build` es obligatorio y síncrono:** la disponibilidad nunca espera al arte.
5. **El isotipo y el logo van juntos o no va ninguno.** Son rutas locales `/logos/` replicadas en el build (`content/lib/mirror.ts`).

## Por qué

- El arte decorativo no puede retener la disponibilidad (ver [plazo de carga](../intro/plazo-de-carga.md)).
- Una sola imagen contaminada rompe todos los paneles.
- Volver a subir el canvas entero por cada logo es caro.

## Qué se descartó

Una construcción asíncrona que espere a la disponibilidad, texturas por logo, fiarse de `crossOrigin` sin la sonda, filas fijas, ajuste *cover* y un logotipo en texto blanco translúcido.

## Se ha roto si…

- Fallan `createBrandAtlas.test.ts` («draws the mark as a RING…», «clamps an out-of-range index…», «sizes the mark by its ink…», «grows exactly one row every two case studies…») o `content/collections/collections.test.ts` (isotipo sin logo y logo sin isotipo).
- El camino asíncrono y la sonda no tienen test.

## Afecta a

`src/experiences/earth/orbit/createBrandAtlas.ts`, `src/experiences/earth/orbit/OrbitSystemLayer.tsx`, `content/lib/mirror.ts`, `content/collections/caseStudies.collection.ts`
