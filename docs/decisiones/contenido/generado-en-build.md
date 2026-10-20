# El contenido se genera en build

**Estado:** vigente · **Desde:** 2026-08-20 (ADR 010); Sanity como proveedor desde 2026-08-23 (`557f671`) · **Sustituye a:** DECISIONS §27 y ADR 010 en lo que dicen de cuándo y cómo se genera el contenido

## Decisión

1. **El navegador nunca llama al CMS.** `npm run content:build` lee todas las colecciones en Node, las valida y escribe módulos TypeScript en `src/content/generated/`, que la aplicación importa como cualquier otro módulo. No hay petición en tiempo de ejecución ni estado de carga.
2. **Lo generado es salida de build, no fuente.** `src/content/generated/`, los medios replicados (`public/logos/`, `public/media/tower/`, `public/media/site/`) y `public/content-version.json` están en `.gitignore`. Git guarda `content/fixtures/` (desarrollo, demos y tests) y, mientras no se retire, `content/seed/` (ver [fallo estricto y fuentes](fallo-estricto-y-fuentes.md)).
3. **La emisión es determinista.** Sin marca de tiempo ni identificador de build; los separadores U+2028/U+2029 se escapan (`JS_LINE_TERMINATORS` en `content/lib/emit.ts`). Un contenido sin cambios produce bytes idénticos.
4. **La generación es transaccional.** Un registro inválido hace fallar su colección, y una colección fallida, el build. Los archivos se escriben en `generated.tmp/` y solo se mueven cuando todas las colecciones han pasado (`commit` en `content/lib/generate.ts`).
5. **El registro de colecciones es el único punto de extensión.** `scripts/build-content.ts` recorre `COLLECTIONS` (`content/collections/index.ts`) y no conoce ninguna por nombre. La receta de una colección nueva está en el [contrato de campos](../../content/sanity-field-contract.md#adding-a-collection).
6. **`npm run check` es la puerta de contenido.** `precheck`, `predev` y `pree2e` ejecutan antes `content:build`. Los predicados de `src/content/invariants.ts` se aplican al escribir y otra vez en `src/content/generated.test.ts`, sobre lo que quedó en disco.
7. **La dependencia va en un sentido.** `content/` (Node) puede importar `src/content/`; nada de `src/` importa `content/`. Lo vigila `check:architecture` §1b.

## Por qué

El producto es una experiencia 3D que tiene que llegar rápido; un origen de terceros en el camino crítico sería un modo de fallo nuevo en el navegador del visitante. El determinismo hace que un diff de contenido signifique algo y mantiene estables los hashes de Vite. La transacción evita sitios a medias: casos de estudio nuevos junto a distritos viejos, o un satélite de menos que parece deliberado.

## Qué se descartó

- Leer el CMS en tiempo de ejecución con respaldo estático.
- Leer dentro de `vercel build` y caer a la salida anterior si falla: en el registro de despliegues no se distingue de un éxito.
- Versionar los módulos generados: Vercel no devuelve a git lo que escribe en un build, así que la copia versionada quedaría obsoleta pareciendo autoritativa.
- Publicar los registros válidos y descartar los inválidos.

## Se ha roto si…

- Aparece `src/content/generated/` en un commit.
- Un módulo generado cambia de bytes sin cambios de contenido, o lleva una marca de tiempo. Fija: `content/lib/generate.test.ts` («is deterministic…», «carries no timestamp…»).
- Un registro inválido deja escritos los demás. Fija: `generate.test.ts` («reports problems and writes NOTHING…», «leaves a previous generation untouched…»).
- Lo que hay en disco no cumple los predicados. Fija: `src/content/generated.test.ts`.
- Algo de `src/` importa `content/`. Fija: `npm run check:architecture` §1b.
- El navegador hace una petición a la API de Sanity (inspección de red; ningún test lo mira en el navegador).

## Afecta a

`scripts/build-content.ts`, `content/lib/generate.ts`, `content/lib/emit.ts`, `content/lib/source.ts`, `content/collections/index.ts`, `src/content/generated/`, `src/content/invariants.ts`, `src/content/generated.test.ts`, `package.json` (`content:build`, `predev`, `precheck`, `pree2e`), `.gitignore`, `checks/architecture.ts`
