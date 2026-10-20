# Analítica

**Estado:** vigente · **Desde:** 2026-09-18 (`2414f83`, Vercel Web Analytics y Speed Insights) y 2026-09-25 (`341f464`, Google Analytics 4), a petición del cliente · **Sustituye a:** DECISIONS §35 en «one `analytics` category … with nothing behind it»; PROJECT_MEMORY §12, deuda «No analytics, no error reporting», en su mitad de analítica

## Decisión

1. **Tres scripts detrás de una sola categoría (`analytics`):** Vercel Web Analytics y Speed Insights (`src/app/vercelInsights.ts`) y GA4 (`src/app/googleAnalytics.ts`, `MEASUREMENT_ID`).
2. **Nada carga sin un registro de [consentimiento](consentimiento.md) vigente con `analytics: true`.** Los scripts se añaden al `<head>` desde el bundle con el primer registro que consiente, y una sola vez por documento.
3. **Solo en un despliegue de producción:** `VERCEL_INSIGHTS_ENABLED` y `GOOGLE_ANALYTICS_ENABLED` en `src/platform/buildFlags.ts`. En dev, en `vite preview`, en los previews de Vercel y en e2e no carga nada.
4. **Cada entrada arranca los dos cargadores:** `src/main.tsx`, `src/entries/blog.tsx` y `src/entries/not-found.tsx`.
5. **Un script cargado no se puede descargar, así que la retirada se aplica así:**
   - Vercel: el hook `beforeSend` lee el registro vivo y descarta todos los eventos;
   - GA4: el interruptor `ga-disable-<id>` y el borrado de las cookies `_ga` y `_ga_*` en cada sufijo del dominio.
   La retirada hecha en otra pestaña llega por el evento `storage` que reenvía `consent.ts`.
6. **En GA4 solo se concede `analytics_storage`.** El almacenamiento y las señales publicitarias (`ad_storage`, `ad_user_data`, `ad_personalization`) quedan siempre denegados, porque el banner no pregunta por ellos.
7. **Sin paquetes `@vercel/*` ni el snippet de Google:** las colas de comandos están escritas en el bundle.

## Por qué

- **GA4 se instaló a petición del cliente.** Es él quien quiere medir con Google Analytics. Vercel Web Analytics y Speed Insights llegaron una semana antes; su commit no explica el motivo.
- Sin paquetes: los de Vercel declaran un peer opcional que fija React 18 y rompen `npm install` en Vercel con React 19; además, fuera de Next, Nuxt o SvelteKit, no hacen más que lo que hace `vercelInsights.ts`.
- Sin snippet: el de Google es un `<script>` inline, y `script-src` no admite `'unsafe-inline'` (ver [cabeceras y CSP](cabeceras-y-csp.md)); además cargaría antes de que el visitante conteste.
- Solo en producción: `/_vercel/*` solo existe en Vercel, y el tráfico de dev y de preview contaminaría la propiedad del cliente.
- Retirada completa: `analytics_storage: 'denied'` seguiría enviando pings sin cookies, y eso no es lo que significa «no».

## Qué se descartó

- Los paquetes `@vercel/analytics` y `@vercel/speed-insights`.
- El snippet inline de gtag.
- Consent Mode con denegación como única forma de retirarse.

## Qué no cubre

No hay reporte de errores: un fallo en producción sigue sin verse (la otra mitad de la deuda de PROJECT_MEMORY §12 y de la auditoría OBS-1 sigue abierta).

## Pendiente de auditar

La última auditoría de seguridad es la del 2026-09-02 (`docs/audits/reports/cybersecurity-project-security-2026-09-02.md`). Todo lo siguiente es posterior o no se revisó:

- **Los endpoints de los formularios** (`api/contact.ts`, `api/audit.ts`, `server/`): ninguna auditoría ha leído el código del servidor. Nombre, email, teléfono, web y mensaje salen hacia Resend y hacia el buzón del cliente.
- **GA4 con la CSP aplicada:** solo lo fijan las aserciones de `scripts/vercelConfig.test.ts` sobre la cadena de la política, no una ejecución real en producción.
- **Vercel Web Analytics y Speed Insights:** qué datos envían.
- **Los textos visibles frente a lo que se carga:** el banner, el panel y la política pueden no nombrar los proveedores reales (ver [trampas](../../trampas/formularios-y-privacidad.md)). Es un riesgo de cumplimiento, no técnico.
- **La dirección del destinatario:** `contactEmail` viaja en el contenido generado que importa el JS inicial, así que probablemente es pública. Sin verificar en un build.
- **El juego del mirador y la puerta de lanzamiento** (`api/view.ts`, `api/claim.ts`, `server/view/`, `middleware.ts`, `server/launchGate.ts`): siguen desplegados y nunca se auditaron. Están pendientes de retirar.

## Se ha roto si…

- Fallan `googleAnalytics.test.ts` o `vercelInsights.test.ts` (nada antes de contestar, nada si se rechaza, una carga al primer sí, retirada, nada fuera de producción).
- `scripts/vercelConfig.test.ts` falla: la CSP dejó fuera un host de Google o admitió `'unsafe-inline'` en `script-src`.
- Se añade un proveedor sin subir `CONSENT_VERSION` ni actualizar la política de cookies.

## Afecta a

`src/app/vercelInsights.ts`, `src/app/googleAnalytics.ts`, `src/app/consent.ts`, `src/platform/buildFlags.ts`, `src/main.tsx`, `src/entries/blog.tsx`, `src/entries/not-found.tsx`, `vercel.json`, `scripts/vercelConfig.test.ts`
