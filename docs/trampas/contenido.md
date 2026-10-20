# Trampas: contenido y CMS

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/contenido/`](../decisiones/contenido/). Las trampas de las marcas subidas y de las placas están en [escena de la Tierra](earth.md).

## Fuentes y entorno

1. **El modo `seed` está en retirada: no lo uses.** El código aún lo acepta (`CONTENT_SOURCE=seed`, también en producción, con un aviso en el log), y los mensajes de error de `content/lib/config.ts` en producción todavía lo recomiendan. Pero `content/seed/` es casi una copia de `content/fixtures/` (varios archivos son idénticos, `caseStudy.json` entre ellos, y `siteSettings.json` lleva teléfonos de relleno), así que publicaría contenido de demostración. Retirarlo es una tarea de código pendiente (ver [fallo estricto y fuentes](../decisiones/contenido/fallo-estricto-y-fuentes.md)). No lo confundas con `sanity-studio/scripts/import-fixtures.mjs`, que genera un `.out/seed.ndjson` desde los fixtures para poblar un dataset nuevo.
2. **`vite.config.ts` importa contenido generado** (`BLOG_POSTS`, `SITE_SEO`) al cargarse. Un `vite` o `vite build` sin `content:build` previo falla al cargar la configuración, no con un error de contenido. Los scripts de npm lo encadenan (`predev`, `precheck`, `pree2e`); ejecutar Vite a mano, no.
3. **El Studio y el build leen variables distintas.** `sanity-studio/.env` usa `SANITY_STUDIO_*`; el `.env` de la raíz usa `SANITY_PROJECT_ID`, `SANITY_DATASET` y `SANITY_TOKEN`. `.env.example` no lo lee nada. Nunca pongas un prefijo `VITE_` o `SANITY_STUDIO_` a un token.
4. **`SANITY_DATASET` no tiene valor por defecto en ningún sitio, a propósito.** Fija: `content/lib/config.test.ts` («refuses to guess a dataset»).
5. **Un `VERCEL_ENV` ausente o mal escrito hace fallar el build**, porque todas las guardas comparan con `'production'` y fallarían abiertas. En Vercel lo activa «Automatically expose System Environment Variables». Fija: `config.test.ts`.
6. **Las rutas se resuelven con `process.cwd()`, nunca con `import.meta.dirname`.** `scripts/build-content.ts` se empaqueta en `node_modules/.cache/` antes de ejecutarse, así que su directorio es el de la caché.

## Sanity

7. **Un id de documento con punto es invisible para el build.** Sanity reserva el segmento anterior al punto (`drafts.`, `versions.…`): el documento se ve en el Studio y en la CLI autenticada, pero la consulta anónima no lo devuelve, y el build dice «collection is empty» sin más explicación.
8. **Tras publicar, el build puede leer el estado anterior** (consistencia eventual). Si un cambio no aparece, se vuelve a desplegar. No añadas esperas sin medir.
9. **Un campo que el esquema tiene y la proyección no, no existe para el sitio; uno que la proyección pide y el esquema no define llega como `null` y hace fallar el build.** Cambia los dos a la vez.
10. **La proyección de un medio replicado debe devolver una cadena** (`logo.asset->url`, `image.asset->url`). Un `logo` a secas devuelve el objeto de imagen y el replicador lo rechaza; como los fixtures llevan `null`, nada local lo detectaría. Fija: `content/collections/collections.test.ts`.
11. **El documento `siteSettings` lo leen dos colecciones** (`siteSettings.collection.ts` y `siteSeo.collection.ts`). `SITE_SETTINGS` va al bundle del navegador; `SITE_SEO` solo lo usa el plugin `siteHead` de `vite.config.ts`, y `check:architecture` impide que las entradas lo importen. No metas campos de SEO en `siteSettings.collection.ts`.
12. **Un campo oculto en el Studio no puede ser `required()`**: Sanity valida también los campos ocultos, y el editor no podría publicar por un error que no ve.
13. **El webhook de Sanity a Vercel se gestiona fuera del repo** (`sanity-studio/README.md`). Su filtro de tipos debe incluir todos los que publican algo, también `towerScreen`; si falta uno, publicar ese tipo no despliega nada y no falla nada. No se puede verificar desde el código.
14. **Reimportar fixtures con `--replace` sobrescribe lo editado**, incluidas las marcas subidas en el Studio, que quedan huérfanas en la biblioteca. Solo para un dataset nuevo.

## Texto

15. **Quita etiquetas antes de decodificar entidades, y no borres un `<` que no abre etiqueta.** Al revés, `&lt;script&gt;` se convierte en etiqueta y se borra texto escapado a propósito, y «precio <5%» se publica como «precio 5%». Fija: `content/lib/html.test.ts`.
16. **U+2028 y U+2029 rompen el módulo emitido**, no el renderizado. `JS_LINE_TERMINATORS` en `content/lib/emit.ts` los escapa, y la expresión se construye con escapes ASCII porque un literal U+2028 en el código fuente lo vuelve ilegible para algunos analizadores. Sin test.
17. **Un bloque vacío de Portable Text se descarta; cualquier otro bloque desconocido hace fallar el build.** No «arregles» lo segundo como lo primero. Fija: `content/lib/portableText.test.ts`.
18. **Un título hecho con negrita no es un título, pero el build no lo exige.** Que un texto legal no tenga títulos es solo un aviso del Studio (`legalHeadingsAdvice` en `sanity-studio/schemas/lib/legalBody.ts`); el 2026-09-18 una regla así en el build tumbó un despliegue. No vuelvas a convertirlo en error del build.

## Medios

19. **El replicador no vuelve a descargar un archivo que ya existe con ese nombre.** Es correcto porque el nombre es direccionado por contenido; en local, un archivo corrupto en `public/logos/` se queda hasta que lo borres.
20. **Un medio declarado sin archivo hace fallar el build; un medio ausente no.** `{ _type: 'imageMedia', alt: '…' }` sin subida es «declarado sin archivo». Fija: `content/lib/mirror.test.ts`, `collections.test.ts`.

## Studio

21. **El Studio importa código del sitio**, no solo los límites: `cityDistrictBindings.ts` y `orbitAssignments.ts` para validar, componentes y CSS para la [vista previa](../decisiones/contenido/vista-previa-del-studio.md), y módulos de `content/lib/`. Un cambio en esos archivos obliga a volver a desplegar también el Studio, o sus validaciones y vistas previas quedan desfasadas.
22. **`previewStyles.ts` nombra las fuentes por su nombre de archivo con hash.** Renombrar una fuente de `public/fonts/` rompe `sanity build`, y una fuente que el CSS usa y no está en el mapa se queda sin cargar en la vista previa, sin error.
23. **`npm audit` del Studio da avisos aceptados: no ejecutes `npm audit fix --force`** (rebaja `sanity` de versión mayor). El análisis y cuándo reabrirlo están en `sanity-studio/README.md`.
24. **`check:studio` se salta, con aviso y en verde, cuando falta `sanity-studio/node_modules/typescript`**, que es siempre el caso en Vercel. Y `npm run check` no ejecuta los tests del Studio (`npm --prefix sanity-studio test`).

## Contenido de relleno

25. **Los casos de estudio de los fixtures nombran empresas reales con métricas inventadas.** No pueden publicarse. Sustituirlos significa cambiarlos en Sanity y en `content/fixtures/` (y en `content/seed/` mientras exista).

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Entorno, selección de fuente | `content/lib/config.test.ts` |
| Consulta a Sanity | `content/lib/sanity.test.ts` |
| Mapeo y validación de una colección | `content/collections/collections.test.ts`, `src/content/generated.test.ts` |
| Generación, transacción, determinismo | `content/lib/generate.test.ts` |
| Portable Text, texto plano | `content/lib/portableText.test.ts`, `content/lib/html.test.ts` |
| Medios | `content/lib/mirror.test.ts`, `scripts/publicationHygiene.test.ts` |
| Límites compartidos con el Studio | `content/collections/editorialBounds.test.ts`; `npm --prefix sanity-studio test` y `npm run check:studio` con el Studio instalado |
| Vista previa del Studio | `npm run check:studio` con el Studio instalado; `npm --prefix sanity-studio run build` |
| Pantalla de la torre | `layoutTowerSlides.test.ts`, `src/content/tower.test.ts` |
| `<head>` y favicon | `scripts/siteHead.test.ts` |
| Sello de versión | `content/lib/contentVersion.test.ts` |
| Fronteras de dependencias | `npm run check:architecture` |
| Contra el dataset real | `CONTENT_SOURCE=sanity npm run content:build`, solo si se pide |

**Sin cobertura:** el escape de U+2028/U+2029; el filtro de tipos del webhook; que `editorialBounds.ts` y `campusShapes.ts` no ganen imports; que el navegador no pida nada a la API de Sanity; «Estado de la web» frente a un build fallido real; que los archivos que importa la vista previa del Studio existan (check pendiente).

## Posibles defectos

- **`public/content-version.json` publica la ruta absoluta del directorio** en el campo `source` cuando la fuente son los fixtures o el seed (`source.describe` en `content/lib/source.ts`). No es un secreto, pero contradice los comentarios de `contentVersion.ts` y `publicationHygiene.ts`, que dicen que solo lleva el nombre de la fuente.
