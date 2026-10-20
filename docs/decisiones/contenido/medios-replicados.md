# Los medios que se dibujan se replican en el despliegue

**Estado:** vigente · **Desde:** 2026-08-23 (`d40babf`, marcas); imágenes de la pantalla de la torre desde 2026-09-22 (`90361a6`); favicon desde 2026-09-23 (`f600914`) · **Sustituye a:** DECISIONS §31 («Brand logos are mirrored…») y ADR 011 en lo mismo; fila «`logo` becomes a CMS media URL» de la tabla «Superseded»

## Decisión

1. **Lo que se dibuja en un canvas o enlaza el `<head>` se copia al despliegue en el build:** las marcas de los casos (`/logos/`), las imágenes de la pantalla de la torre (`/media/tower/`) y el favicon (`/media/site/`). Lo hace `withMediaMirror` (`content/lib/mirror.ts`), que envuelve solo la fuente Sanity.
2. **Las imágenes editoriales del blog se quedan en `cdn.sanity.io`**, modeladas como `ImageMedia` con `alt` obligatorio. Por ellas `img-src` admite `https://cdn.sanity.io` en la CSP de `vercel.json`; nada más del sitio debería cargarse de ahí.
3. **Solo se descarga del origen permitido** (`SANITY_CDN_ORIGIN` en `scripts/build-content.ts`, fijo en código), por `https`, con nombre de archivo seguro (`SAFE_BASENAME`) y tamaño máximo (`MAX_BYTES`), ambos en `mirror.ts`.
4. **SVG prohibido** en todas las subidas, deliberadamente y no para siempre: habilitarlo exige un sanitizador y un cambio revisado de `remoteMediaUrl` (`content/lib/validate.ts`).
5. **El nombre lo da Sanity**, direccionado por contenido, y un archivo ya presente no se vuelve a descargar. Eso mantiene la emisión determinista. Si una regla declara `maxSize`, el archivo se descarga redimensionado por la API de imágenes de Sanity y el nombre lo dice.
6. **Cada colección declara qué campos se replican** (`mirror`, con `[]` como único comodín para arrays), en qué carpeta (`mirrorDir`; sin ella, `/logos`) y con qué reglas (`mediaRules`). Las reglas concretas de cada medio están en el [contrato de medios](../../content/sanity-media-contract.md); las de las marcas, en [validación de marcas subidas](../earth/validacion-de-marcas-subidas.md).
7. **Un medio declarado que no se puede descargar hace fallar el build.** Un medio ausente es legal donde el renderizador tiene un estado de diseño para ello.
8. **Solo se publica lo que la lista de publicación admite** (`isTowerMedia`, `isSiteMedia` en `scripts/publicationHygiene.ts`).

## Por qué

Un dibujo de origen cruzado puede contaminar el canvas compartido, cada visitante haría una petición a un tercero y el aspecto del sitio dependería de la CDN de Sanity. El favicon tampoco debe depender de una CDN ajena, y con nombre direccionado por contenido una subida nueva es una URL nueva. Las imágenes del blog crecen sin límite y no se dibujan en un canvas.

## Qué se descartó

- Replicar todos los medios (cada despliegue crecería con la biblioteca) o ninguno (la textura de marcas dependería de la CDN).
- Descargar en el mapper: el mapper es síncrono y no debe conocer la red.
- Replicar también fixtures: ya llevan rutas locales y tienen que funcionar sin red.

## Se ha roto si…

- El navegador pide a `cdn.sanity.io` una marca, una imagen de la torre o el favicon (inspección de red).
- Un build termina bien con un medio declarado que da 404. Fija: `content/lib/mirror.test.ts` («fails the build on a missing asset…»).
- Llega a `public/` un SVG, un archivo de otro origen o uno servido por `http:`. Fija: `mirror.test.ts` («rejects SVG», «rejects an origin that is not the CMS», «rejects plain http»).
- `public/logos/` crece en un build sin marcas nuevas. Fija: `mirror.test.ts` («does not re-download a file it already has»).
- Un archivo replicado no llega a `dist/`, o llega algo que no es un medio. Fija: `scripts/publicationHygiene.test.ts`.

## Afecta a

`content/lib/mirror.ts`, `content/lib/validate.ts` (`remoteMediaUrl`, `sanityImageDimensions`), `content/collections/types.ts` (`MediaRule`, `SanitySourceSpec`), `content/collections/caseStudies.collection.ts`, `content/collections/towerScreen.collection.ts`, `content/collections/siteSeo.collection.ts`, `scripts/build-content.ts`, `scripts/publicationHygiene.ts`, `vercel.json` (CSP y caché de `/logos` y `/media`), `.gitignore`
