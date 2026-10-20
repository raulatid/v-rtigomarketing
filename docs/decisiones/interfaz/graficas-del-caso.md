# Las gráficas del caso: SVG hecho a mano, cuatro tipos, color de marca en las marcas

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`); color de marca desde el 2026-08-27 (`8b525cc`); gráfica opcional desde el 2026-09-19 (`e634a1c`) · **Sustituye a:** DECISIONS §26.14

## Decisión

1. **La gráfica es SVG en línea escrito a mano** (`src/components/CaseChart.tsx`), sin dependencia. Cuatro tipos (`CHART_TYPES` en `src/content/invariants.ts`): línea, área, barras y donut. El tipo lo elige el editor (ver [qué decide el editor](../contenido/que-decide-el-editor.md)).
2. **Cada serie se normaliza a su propio mínimo y máximo:** las unidades no importan, solo la forma.
3. **El color de marca del caso (`brandColor`) va solo en las marcas** (trazo, relleno, punto final, barra máxima, segmentos y muestras de la leyenda), a través de `--case-brand`, que `CasePanel` fija en el panel. Tarjeta, rejilla y etiquetas siguen siendo vidrio neutro. Sin color de marca, el build entrega blanco.
4. **El donut distingue segmentos por opacidad, no por tono:** hay un solo color por caso.
5. **La gráfica es opcional y, si existe, va completa.** Un caso sin nada que dibujar no tiene bloque. Una gráfica empezada necesita título y entre `chartValuesMin` y `chartValues` puntos (`EDITORIAL_BOUNDS.caseStudy` en `src/content/editorialBounds.ts`; ver [límites editoriales](../contenido/limites-editoriales.md)). Barras y donut necesitan una etiqueta por valor.
6. **El componente se defiende igualmente:** una serie vacía o con un valor no finito dibuja solo el título.
7. **Todo bloque del panel reserva su altura y se pinta desde `shown`** (el último caso), no desde `data`: el panel sigue montado durante su fundido. Antes del primer caso, unos marcadores mantienen la altura.

El panel en sí (hoja, paradas, alturas) es [otra decisión](../earth/panel-del-caso.md). Su rAF de medida corre cada fotograma mientras hay un caso abierto, también en escritorio, y se queda así: no dibuja (ver la [regla de los bucles](../render/un-renderer-para-la-escena.md)). Los casos de los fixtures son de relleno (ver [trampas de contenido](../../trampas/contenido.md), n.º 25).

## Por qué

- Cuatro formas fijas con pocos puntos no justifican una biblioteca, y en SVG plano el estilo vive en el CSS.
- Un valor no finito no lanza error: deja un `d` inválido y una gráfica vacía. El build valida, pero el componente es la última línea.
- Un caso real puede no tener serie que enseñar; antes se rechazaba o se rellenaba.

## Qué se descartó

- Una biblioteca de gráficas y distinguir segmentos por tono.
- Exigir gráfica y métricas a todos los casos.
- Pintar el panel desde `data`: el fundido de salida animaba un panel vacío.

## Se ha roto si…

- Fallan `src/content/caseStudies.test.ts` («gives every chart a renderable series», «labels every value when a chart shape needs labels», «gives every brandColor as parseable #rrggbb hex»), `src/components/CasePanel.test.tsx` («leaves the chart block out for a case with nothing to plot») o `content/collections/collections.test.ts`.
- El panel salta durante el fundido de salida, o el color sale de las marcas. Solo visual.

## Afecta a

`src/components/CaseChart.tsx`, `src/components/CasePanel.tsx`, `src/styles.css` (`.case-chart*`), `src/content/types.ts`, `src/content/invariants.ts`, `src/content/editorialBounds.ts`, `content/collections/caseStudies.collection.ts`, `sanity-studio/schemas/caseStudy.ts`
