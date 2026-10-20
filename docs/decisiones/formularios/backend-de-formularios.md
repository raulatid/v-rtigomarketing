# Backend de los formularios

**Estado:** vigente · **Desde:** 2026-09-04 (`84e1b28`); arranque en Vercel corregido el 2026-09-21 (`131022f`) · **Sustituye a:** DECISIONS §30 en «The contact form obeys the audit form's transport rule» y en su «Broken when». Los comentarios de código que remiten a «adr/014» o al «plan 012» para el limitador y el tier del servidor (`server/rateLimit.ts`, `server/validate.ts`, `checks/architecture.ts`) se refieren a esta decisión: ese ADR nunca se escribió

## Decisión

1. **Los formularios de contacto y de auditoría envían a dos funciones de Vercel del mismo origen:** `CONTACT_ENDPOINT` en `src/app/contactSubmission.ts` y `AUDIT_ENDPOINT` en `src/app/auditSubmission.ts`. Los archivos de `api/` son adaptadores de pocas líneas; toda la lógica vive en `server/` y se prueba allí.
2. **Los dos transportes y las dos rutas se duplican a propósito**, para que cada formulario pueda cambiar de backend por separado. Lo compartido es `server/` y, en el navegador, la interpretación de la respuesta (`src/app/submissionResponse.ts`).
3. **El formulario solo entra en éxito cuando el servidor confirma la entrega.** La regla de honestidad está en `readMailConfig` (`server/config.ts`):
   - en producción, si falta `RESEND_API_KEY` o hay `MAIL_DRY_RUN`, la configuración falla y el visitante ve un error, nunca un «recibido» falso;
   - fuera de producción, sin clave, se hace un dry run, para que un clon recién hecho pueda probar el formulario entero sin configurar nada;
   - un `VERCEL` presente sin `VERCEL_ENV`, o un `VERCEL_ENV` fuera de los valores que Vercel usa (`VERCEL_ENVIRONMENTS`), es un fallo, no un entorno adivinado.
4. **El correo sale por Resend con `fetch` directo, sin paquete** (`RESEND_ENDPOINT` en `server/resend.ts`). La respuesta del proveedor nunca llega al cliente.
5. **El destinatario es `contactEmail` de Sanity** (`cmsRecipient` en `server/recipient.ts`), salvo que `MAIL_TO_OVERRIDE` lo sustituya. Es contenido generado en el build: cambiarlo exige redesplegar.
6. **El servidor no se fía de nada que mande el navegador.** `server/validate.ts` es una segunda copia de las reglas, deliberada: la del navegador existe para ser amable y esta para ser correcta. Valida y limita cada campo (`CAPS`, `PLANS`, `readRange`), rechaza en `website` los hosts que solo le interesan a quien hace fetch del valor (loopback, privados, link-local, sin punto) aunque nadie lo haga, y limita el cuerpo en bytes (`BODY_LIMIT_BYTES` en `server/endpoint.ts`).
7. **El antiabuso no usa ningún servicio externo y es orientativo:** honeypot (campo `empresa`), tiempo mínimo de rellenado (`MIN_FILL_MS` en `server/rateLimit.ts`) y topes por hora por IP y por dirección, en la memoria de cada instancia (valores por defecto en `server/config.ts`, ajustables con `MAIL_RATE_PER_HOUR` y `MAIL_RATE_EMAIL_PER_HOUR`). Un honeypot relleno responde éxito y no envía nada.
8. **El correo de notificación escapa todos los valores y no lleva ningún enlace** (`server/renderEmail.ts`): un enlace en una notificación es un enlace que alguien pulsa.
9. **Fuera de producción la respuesta dice qué pasó** (`delivery`: `sent`, `dry-run` o `discarded`, en `server/handleSubmission.ts`); en producción no, para no revelar si el endpoint está configurado.
10. **El navegador nunca importa `server/` ni `api/`,** y `server/` solo lee del árbol del navegador el contenido generado (`src/content/`). Lo vigila `check:architecture`.

## Por qué

Hasta el 2026-09-04 los dos transportes eran stubs: en demo resolvían y en producción rechazaban, porque un «Solicitud recibida» que nadie lee es mentira. Al llegar el backend, la mentira posible pasó a ser otra: un despliegue que deja de enviar en silencio porque falta una variable mientras el visitante sigue viendo el recibo. Por eso, en producción, la falta de clave es un error.

Las funciones están escritas contra `Request`/`Response` estándar para que el mismo código sirva a Vercel, a `vite dev` y a `vite preview` (plugin `apiRouting` en `vite.config.ts`) y, por tanto, a Playwright.

## Qué se descartó

- Un almacén duradero (Redis/KV) para el limitador: otro servicio y otro secreto para dos formularios de una web de marketing.
- El paquete `resend`: superficie de cadena de suministro para unas pocas líneas de HTTP.
- Una factoría común de transportes: acoplaría las cargas de los dos formularios.
- Tests junto a `api/`: Vercel publica como ruta cualquier archivo de esa carpeta.

## Se ha roto si…

- `npm run check:functions` falla: algún `api/*.ts` no arranca como lo carga Vercel.
- `server/config.test.ts` deja de exigir el fallo en producción sin clave o con `MAIL_DRY_RUN`.
- Falla `e2e/forms.spec.ts` (dry run en el servidor de preview, validación en servidor, honeypot, envío demasiado rápido, solo POST JSON, «never reaches the delivered state when the endpoint fails»).
- Un formulario llega al estado de entregado cuando el endpoint ha fallado (`ContactSection.test.tsx`, `AuditSection.test.tsx`).
- Un módulo de `src/` importa `server/` o `api/` (`check:architecture`, «the browser never imports the server tier»).

## Afecta a

`api/contact.ts`, `api/audit.ts`, `server/endpoint.ts`, `server/config.ts`, `server/handleSubmission.ts`, `server/validate.ts`, `server/rateLimit.ts`, `server/recipient.ts`, `server/renderEmail.ts`, `server/resend.ts`, `src/app/contactSubmission.ts`, `src/app/auditSubmission.ts`, `src/app/submissionResponse.ts`, `src/app/submissionError.ts`, `vite.config.ts` (`apiRouting`), `checks/function-boot.ts`, `checks/architecture.ts`, `.env.example`
