# La salida se verifica antes de publicarse

**Estado:** vigente · **Desde:** 2026-09-15 (`fd456fe`, `77b9a03`); `public/` por lista de permitidos desde el 2026-09-19 (`2e6c2db`) · **Sustituye a:** la política de `archivo/production-hygiene.md`

## Decisión

1. **`public/` se publica por lista, no entero.** `copyPublicDir: false` en `vite.config.ts`. El plugin `publicationHygiene` emite solo lo que acepta `isPublicAsset` (`scripts/publicationHygiene.ts`), y lo emite antes de que `assertNoSecrets` inspeccione el bundle. Un archivo suelto en `public/` no se convierte en una URL. Qué entra en la lista es de [recursos publicados](recursos-publicados.md).
2. **Producción no lleva notas internas:**
   - los comentarios HTML se quitan con un parser (`stripHtmlComments`), después de que el generador del blog consuma sus marcadores;
   - los comentarios GLSL se quitan en el build (`stripShaderComments`, vía `glsl({ compress })`);
   - no se emiten source maps (`build.sourcemap: false`).
3. **`verifyPublication` rechaza el `dist/` si encuentra:**
   - archivos de desarrollo (ocultos, `proto-sky`, `sky-test-`, `.map`, `.ts`, `.tsx`, `.md`, `.log`, `.bak`, `.blend`);
   - comentarios HTML;
   - rutas locales del sistema de archivos (en GLB y KTX2 solo mira los metadatos, no los píxeles);
   - referencias a source maps;
   - rutas de `docs/reports|plans|adr`, y en producción cualquier `docs/*.md`;
   - en producción, `__vertigoBootDebug`;
   - credenciales, por nombre y por valor (ver [cabeceras y CSP](../privacidad/cabeceras-y-csp.md), punto 7).

   También rechaza un `dist/` sin `index.html`, un GLB o KTX2 truncado y cualquier enlace simbólico.
4. **Se verifica dos veces:** al cerrar `vite build`, y con `npm run check:publication` sobre el `dist/` final, después de la captura del blog (ver [puerta de despliegue](puerta-de-despliegue.md)).
5. **En producción los errores reales siguen saliendo.** Un fallo de carga se sigue informando; lo que desaparece son los diagnósticos de desarrollo.

## Por qué

El 2026-09-15 un build de producción explícito llevaba avisos del atlas de marcas que citaban `docs/earth/logo-spec.md`. Lo que se precarga ejecuta sus diagnósticos para todos los visitantes, no solo para los que lo usan; que hoy no diga nada no lo protege cuando lleguen los datos de los que depende. Y la copia por defecto de `public/` publicaba cualquier cosa que alguien dejara allí, sin mirar `.gitignore`.

Coste aceptado: un archivo nuevo en `public/` que la lista no conoce no se publica, y nada avisa. Así le pasó a `content-version.json`, que todas las puertas dejaron pasar (`2e6c2db`).

## Qué se descartó

- La copia estándar de `public/` por Vite.
- Quitar comentarios HTML con expresiones regulares.
- Source maps en producción.
- Silenciar también los errores reales.

## Se ha roto si…

- Falla `scripts/publicationHygiene.test.ts` o `scripts/secretScan.test.ts`.
- `check:publication` deja de ser el último paso de `build`. Sin test.
- `e2e/production-hygiene.spec.ts`, con `VERCEL_ENV=production` exportado, ve salida de consola de la aplicación en una visita correcta, nodos de comentario o el global de depuración, o deja de ver el `[boot] fatal` de un fallo de carga real.
- Un recurso que existe en `public/` devuelve 404 en producción. Sin test.

## Afecta a

`vite.config.ts` (`publicationHygiene`, `assertNoSecrets`, `glsl({ compress })`, `build.sourcemap`, `build.copyPublicDir`), `scripts/publicationHygiene.ts`, `scripts/secretScan.ts`, `scripts/check-publication.ts`, `e2e/production-hygiene.spec.ts`
