# Cada entrada tiene su documento con la cabecera prerenderizada

**Estado:** vigente · **Desde:** 2026-08-31 (ADR 013 §4); la cabecera del índice se edita en «Ajustes del sitio» desde el 2026-09-23 (`f600914`); cuerpo sin JavaScript desde el 2026-11-23 (auditoría de accesibilidad del 2026-11-18, G2) · **Sustituye a:** ADR 013 §4 y los dos primeros párrafos de ARCHITECTURE §15 («Publication policy and asset delivery»)

## Decisión

1. **El build escribe un documento por entrada**, clonado de `blog.html`: `dist/blog/index.html` para `/blog` y `dist/blog/<slug>/index.html` para cada entrada (`blogRoutes` en `vite.config.ts`, `blogDocuments` en `scripts/publicationPolicy.ts`).
2. **Se prerenderiza la cabecera, no el cuerpo:** título, descripción, canónico, `og:*` y un bloque JSON-LD `BlogPosting` (`postHead` en `scripts/blogShell.ts`). El cuerpo lo sigue pintando React en el navegador. No es generación estática y no debe describirse así.
3. **Sin JavaScript, el cuerpo de `/`, de `/blog` y de cada entrada no está vacío:** un `<noscript>` dentro de `#root` dice que la experiencia 3D necesita JavaScript y enlaza el blog y cada entrada por su título (`noscriptRegion` y `replaceNoscript` en `scripts/siteHead.ts`, aplicados por el plugin `siteHead` de `vite.config.ts`; `blog.html` lo lleva a cada documento de entrada). Falla cerrada como el resto: marcas `vertigo:noscript` exactamente una vez. El 404 no lo lleva: no tiene marcas y es `noindex`. Con JavaScript no se ve: el `<noscript>` no pinta y React vacía `#root` en su primer commit. Es lo mínimo para que un rastreador que no ejecuta JavaScript (la mayoría de los de búsqueda con IA) encuentre las entradas por enlaces; el texto de cada entrada sigue sin estar en el HTML (punto 2).
4. **El árbol emitido refleja las URL públicas.** Vercel resuelve primero el sistema de archivos y después los rewrites de `vercel.json` (`/blog` y `/blog/:slug` → `/blog.html`). Así, un slug conocido recibe su propio documento y uno desconocido cae en el SPA, que pinta «Esa entrada no existe» con HTTP 200 y, desde el 2026-11-24, se marca `noindex` desde el cliente ([trampas del blog](../../trampas/blog.md), n.º 29).
5. **En dev y en preview manda la misma regla** (`blogRouting` en `vite.config.ts`, que usa `blogRewrite` de `publicationPolicy.ts`). En preview el rewrite cede ante un archivo real de `dist/`; en dev no hay `dist/` y todo se reescribe. Solo un slug con la forma de un id se busca en disco; los codificados o desconocidos caen en `blog.html` sin decodificarse.
6. **La transformación falla cerrada:**
   - `replaceExactlyOnce` y `replaceRegion` lanzan un error si no encuentran su marca exactamente una vez (`SEO_START`/`SEO_END` en `blogShell.ts`);
   - cada documento se verifica antes de escribirse (`shellProblems`: una etiqueta de cada, URL absolutas, rutas de assets desde la raíz, sin marcas sobrantes);
   - el build compara el árbol emitido con las entradas en los dos sentidos, sin huérfanos ni faltantes (`blogTreeProblems`).
7. **Las cadenas del CMS se escapan con dos funciones distintas**, una para texto y otra para atributos (`escapeHtmlText`, `escapeHtmlAttribute`).
8. El build genera también `robots.txt` y, en producción, `sitemap.xml` con `/`, `/blog` y cada entrada (`seoFiles`, desde `seoAssets` en `vite.config.ts`).

**Frontera:** la cabecera SEO editable (`siteSeo`, `blogIndexRegion` en `scripts/siteHead.ts`) y el esquema de las entradas son del área de contenido/CMS; la receta de build y la entrega de assets, del área de build.

## Por qué

Los rastreadores sociales (Facebook, X, LinkedIn, WhatsApp, Slack) no ejecutan JavaScript y solo leen la cabecera: sin esto, un enlace compartido sale como una tarjeta vacía. Googlebot sí pinta el cuerpo. Un reemplazo de texto a medias daría un documento con buen aspecto y metadatos equivocados, que es el fallo que nadie notaría.

## Qué se descartó

- Prerenderizar también el cuerpo. ADR 013 lo dejó para «un cambio posterior». La auditoría de accesibilidad del 2026-11-18 (G2) lo vuelve a pedir: sin él, quien no ejecuta JavaScript lee los títulos y no el texto. Sigue pendiente de decidir con el usuario; el `<noscript>` del punto 3 no lo sustituye.
- Hasta el 2026-11-23, un `#root` vacío sin JavaScript en los tres documentos.
- Emitir `dist/blog/<slug>.html` con el rewrite apuntando a `blog.html`: las dos piezas nunca se encontraban y los documentos eran archivos muertos.
- Un reemplazo de texto «en lo posible», sin verificación.

## Se ha roto si…

- Fallan `scripts/blogShell.test.ts`, `scripts/publicationPolicy.test.ts` o `scripts/vercelConfig.test.ts`.
- Falla `e2e/publication.spec.ts` («preview serves emitted blog heads and preserves fallback and encoding behavior»).
- El build falla con `[blog shells] …` o con «emitted tree does not match the posts».
- Falla `scripts/siteHead.test.ts` («the body without JavaScript»), o el build falla con «the noscript markers…».

## Afecta a

`blog.html`, `scripts/blogShell.ts`, `scripts/publicationPolicy.ts`, `scripts/siteHead.ts` (`blogIndexRegion`, `noscriptRegion`), `index.html`, `vite.config.ts` (`blogRoutes`, `blogRouting`, `seoAssets`), `vercel.json` (`rewrites`)
