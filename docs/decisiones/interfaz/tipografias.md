# Dos tipografías en dos papeles, declaradas una vez y con nombre privado

**Estado:** vigente · **Desde:** 2026-09-11 (`972640c`, dos papeles, por indicación del cliente); General Sans + Gambetta desde el mismo día (`9f2abe6`) · **Sustituye a:** DECISIONS §47; PROJECT_MEMORY §11.68 (archivado)

## Decisión

1. **Dos papeles, dos nombres privados:** `'Vertigo Display'` (títulos, cabeceras, brújula, titulares y cifras de las fachadas LED, CTA y disparadores) y `'Vertigo Text'` (todo lo demás, incluido el cuerpo de los artículos). Se leen con `--font-display` y `--font-text`.
2. **Se declaran una sola vez,** en `src/components/siteHeader.css`, la hoja que cargan todos los documentos.
3. **Las caras son General Sans (Display) y Gambetta (Text, serif con cursiva),** de Fontshare. Switzer e Inter (`'Vertigo Switzer'`, `'Vertigo Inter'`) quedan solo como respaldo, en segundo lugar de cada pila. El blog y el 404 declaran además sus propias familias de respaldo (`'Vertigo Blog Inter'`, `'Vertigo Blog Serif'` en `blog.css`).
4. **Ninguna familia se llama como la fuente** (`Inter`, `Switzer`…): `@font-face` es global al documento y, en una sesión caliente, `blog.css` se inyecta en el documento de la escena.
5. **Las flechas (← → ↑ ↓) salen de la cara de respaldo:** ni General Sans ni Gambetta las tienen. Por eso Switzer se sigue descargando en cualquier página con una flecha en texto de Display.
6. **Archivos:** woff2 variables en `public/fonts/`, cada uno con los 8 primeros hexadecimales de su SHA-256 en el nombre, porque `/fonts/` se sirve con caché `immutable` (`vercel.json`).
7. **Precarga:** `index.html`, `blog.html` y `404.html` precargan las dos caras, siempre con `crossorigin` (una petición de fuente es CORS aunque sea del mismo origen).
8. **El texto en canvas pide las caras por nombre:** la fachada LED las carga con `document.fonts` (`FACADE_FACES` en `mediaFacade.ts`) y las dimensiona por su altura de mayúsculas (`CAP_TO_EM` en `facadeRenderer.ts`); el anillo del blog (`blogOrbitRing.ts`) y el campus (`createServicesCampus.ts`) usan los mismos nombres.
9. **Excepción: el atlas de marcas de Earth dibuja en `system-ui`** (`createBrandAtlas.ts`), porque rasteriza durante la intro, antes de poder contar con una fuente web.
10. **La [pista de escena](../earth/pista-de-escena.md) no declara familia:** hereda el rol de texto; su tamaño, peso y tracking están en `.scene-hint` (`styles.css`).

## Por qué

- Dos papeles y estas dos caras: decisión tomada. El cambio a General Sans y Gambetta (`9f2abe6`) entró «en revisión»; el usuario la dio por cerrada el 2026-10-20.
- Una sola declaración para que la escena, el blog caliente y el frío descarguen cada archivo una vez.
- Nombres privados: un `Inter` declarado en una hoja del blog cambiaría la tipografía de toda la escena al volver de un artículo, sin ningún diff. Antes del 2026-09-11, `styles.css` pedía un `'Inter'` que nadie declaraba y la escena se pintaba en `system-ui`.

## Qué se descartó

- **Söhne:** los archivos ofrecidos eran copias de prueba de uso personal, con 69 glifos y sin acentos españoles.
- Switzer + Inter como caras principales (quedan de respaldo).
- Caras propias por componente (`'Vertigo Facade Inter'`, `'Vertigo Campus Inter'`) y una `Inter` pública.

## Se ha roto si…

- La tipografía del `body` de la escena cambia tras ir y volver del blog. Fija: `e2e/blog.spec.ts`.
- Una hoja declara una familia con el nombre de la fuente (búsqueda; sin test).
- Un archivo de `public/fonts/` no lleva su hash en el nombre, o una precarga pierde `crossorigin` (sin test).
- Se añade texto a la fachada sin elegir papel (lo impide el tipo `FontRole` de `facadeRenderer.ts`).

## Afecta a

`src/components/siteHeader.css`, `src/styles.css`, `src/blog/blog.css`, `src/notFound/notFound.css`, `index.html`, `blog.html`, `404.html`, `public/fonts/`, `vercel.json`, `src/experiences/murcia/landmark/towerScreen/facadeRenderer.ts`, `src/experiences/murcia/landmark/towerScreen/mediaFacade.ts`, `src/experiences/murcia/campus/createServicesCampus.ts`, `src/experiences/murcia/blogDisplay/blogOrbitRing.ts`, `src/experiences/earth/orbit/createBrandAtlas.ts`, `CREDITS.md`
