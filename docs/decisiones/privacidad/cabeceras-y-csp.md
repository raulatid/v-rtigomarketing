# Cabeceras de seguridad y CSP

**Estado:** vigente · **Desde:** 2026-09-05 (`e2ee116`, CSP aplicada); hosts de Google Analytics desde el 2026-09-25 (`341f464`); `blob:` en `connect-src` desde el 2026-09-26 (`227e249`) · **Sustituye a:** PROJECT_MEMORY §11.67 (`vercel.json` no admite comentarios). No había decisión propia sobre la CSP; lo que dicen de ella DECISIONS §18 y §31, ADR 010 y `docs/content/sanity-media-contract.md` está desfasado y lo corrigen sus áreas

## Decisión

1. **La CSP se aplica (`Content-Security-Policy`); no se mantiene una copia `Report-Only`.** Está en la regla `/(.*)` de `vercel.json`, junto con `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` y `Permissions-Policy`.
2. **El porqué de cada valor vive en `scripts/vercelConfig.test.ts`**, porque `vercel.json` no admite comentarios. El test falla si la política se debilita.
3. **Orígenes externos permitidos:** solo el CDN de Sanity (imágenes del blog) y los hosts de Google Analytics y Tag Manager. Todo lo demás es `'self'`, incluidos Vercel Insights (`/_vercel/*`) y los endpoints `/api/*`.
4. **`'unsafe-eval'` es la única concesión en `script-src`, y no es de la aplicación:** el transcodificador KTX2 (`basis_transcoder.js`, Emscripten) crea funciones con `Function(...)` dentro de un worker `blob:` que hereda la política. `'wasm-unsafe-eval'` se queda en cualquier caso. `'unsafe-inline'` nunca entra en `script-src`; sí en `style-src`.
5. **Sin `frame-src`** (el blog no incrusta iframes) y **`media-src 'self'`** (la música; ver [música](../transicion/musica.md)).
6. **Ni HSTS ni CORS propios en la regla global:** HSTS lo pone Vercel, y los formularios son del mismo origen. La única cabecera CORS del archivo es la de `/content-version.json`, que lee el Studio.
7. **Ningún secreto llega a `dist/`:** `scripts/secretScan.ts`, invocado desde `vite.config.ts` y `scripts/publicationHygiene.ts`, falla el build si una variable `VITE_*` tiene nombre de credencial o si el valor de un secreto aparece en la salida.

## Por qué

Antes del 2026-09-05 la CSP era `Report-Only` sin endpoint de informes: no protegía nada. Se aplicó tras ejecutar sin cabeza el build de producción con la política activa (arranque, descenso a Murcia, POST a `/api`, blog), con cero violaciones. Sin `'unsafe-eval'` el transcodificador falla y el arranque muere: está medido, no supuesto.

## Qué se descartó

- Mantener `Report-Only` en paralelo: sin endpoint de informes, solo produce ruido en la consola del visitante.
- `'unsafe-inline'` en `script-src`, y con él el snippet de Google.
- Una HSTS propia: sería una segunda fuente de verdad para una cabecera que el navegador recuerda durante mucho tiempo.

## Se ha roto si…

- Falla `scripts/vercelConfig.test.ts`.
- Un despliegue «no cambia nada»: una clave desconocida en `vercel.json` hace que Vercel rechace el build y la URL siga sirviendo el anterior (ver [trampas](../../trampas/formularios-y-privacidad.md)).
- El build no falla con un secreto en `dist/` (`scripts/secretScan.test.ts`).
- La consola del navegador muestra `securitypolicyviolation` en el arranque, en Murcia, en el blog o tras aceptar la analítica. No lo fija ningún test automático.

## Afecta a

`vercel.json`, `scripts/vercelConfig.test.ts`, `scripts/secretScan.ts`, `scripts/publicationHygiene.ts`, `vite.config.ts`, `src/app/googleAnalytics.ts`
