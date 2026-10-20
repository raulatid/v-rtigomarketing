# Sanity es el CMS, y la proyección GROQ es la capa de normalización

**Estado:** vigente · **Desde:** 2026-08-23 (`557f671`, ADR 011) · **Sustituye a:** DECISIONS §31 y ADR 011 en lo que dicen del proveedor y de la consulta

## Decisión

1. **Sanity es la fuente editorial.** El Studio es un paquete propio (`sanity-studio/`), alojado por Sanity, con su propio árbol de dependencias. Nada de Sanity entra en el bundle del sitio: ni `@sanity/client` ni variables `VITE_SANITY_*`.
2. **Una consulta por colección, con `fetch`.** `sanitySource` (`content/lib/sanity.ts`) envía cada consulta a `api.sanity.io`, nunca a la CDN de consultas (`apicdn.sanity.io`).
3. **La proyección devuelve exactamente la forma que lee el mapper.** Cada colección declara su `SanitySourceSpec` (`type`, `projection`, `orderBy`, y para medios `mirror` y `mirrorDir`) en `content/collections/types.ts`. Después de la proyección nadie ve `_ref`, `_type`, `slug.current` ni objetos de asset. No es una abstracción neutral respecto al proveedor, a propósito.
4. **Los borradores se excluyen en el filtro de la consulta**, no se descargan para descartarlos después.
5. **Siempre hay orden explícito** (`DEFAULT_ORDER` si la colección no da uno): sin orden no hay salida determinista.
6. **Se falla en vez de truncar.** Se piden `MAX_RECORDS + 1` registros y se rechaza la colección si llegan todos.
7. **La versión de la API está fijada en código** (`SANITY_API_VERSION`), no en el entorno: decide la forma de la respuesta y cambiarla es un cambio revisado.
8. **El identificador de proyecto y el dataset se validan** (`PROJECT_ID_PATTERN`, `DATASET_PATTERN`) antes de construir la URL, porque el primero acaba en el host.
9. **Los singletons se comprueban dos veces:** el Studio oculta «crear otro», y el `audit` de la colección exige exactamente un documento (`siteSettings`, `towerScreen`) o el conjunto fijo de documentos legales (`legalDoc`).
10. **Publicar es divulgar.** El dataset responde a lecturas anónimas de lo publicado; ningún campo puede existir para guardar información que no deba ser pública, aunque el sitio no la muestre.

## Por qué

La integración con WordPress nunca funcionó y no había nada que conservar; Sanity elimina un servidor que había que defender. Una sola consulta elimina las lecturas partidas de la paginación. La CDN de consultas es justo lo contrario de lo que se quiere en un build que arranca segundos después de publicar.

## Qué se descartó

- Arreglar el mapeo de WordPress y mantener su instalación.
- Un contrato de fuente neutral respecto al proveedor.
- `@sanity/client` y `apicdn.sanity.io`.
- Pedir exactamente `MAX_RECORDS` y rechazar una página llena: rechazaría una colección legítima.

## Qué queda abierto

La lectura no es transaccional respecto al instante de publicar: Sanity es eventualmente consistente, así que un build lanzado por el webhook puede leer el estado anterior. Si un cambio no aparece, se vuelve a desplegar. No se añaden esperas sin medir.

## Se ha roto si…

- Una consulta va a la CDN, sin filtro de borradores, sin orden o con otra versión de API sin revisión. Fija: `content/lib/sanity.test.ts` («reads the live API, never the query CDN», «excludes drafts in the filter», «addresses the project, dataset and pinned API version», «asks for one record past the ceiling»).
- Una respuesta 200 con `error` vacía una colección en lugar de fallar. Fija: `sanity.test.ts` («fails on an error payload even at status 200»).
- Aparece un segundo `siteSettings` o `towerScreen` y el build no falla. Fija: `content/collections/collections.test.ts` («accepts exactly one document…»).
- Un esquema gana un campo para algo privado «porque nada lo renderiza» (revisión humana).

## Afecta a

`content/lib/sanity.ts`, `content/lib/source.ts`, `content/collections/*.collection.ts`, `content/collections/types.ts`, `sanity-studio/` (esquemas y estructura), `sanity-studio/GUIA-EDITOR.md`, [contrato de campos](../../content/sanity-field-contract.md)
