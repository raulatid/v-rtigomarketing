# El build es la puerta de despliegue

**Estado:** vigente · **Desde:** 2026-08-13 (`f27983f`); `check:studio` desde el 2026-09-05 (`63e34e8`); captura del blog desde el 2026-09-09 (`31ec6c3`); `check:publication` desde el 2026-09-15 (`77b9a03`); `check:functions` desde el 2026-09-21 (`131022f`); `VERTIGO_SKIP_BUDGETS` rechazada en Vercel desde el 2026-10-20 (`293a877`) · **Sustituye a:** DECISIONS §12 (la receta del build y «Ruled out»); la fila «`npm run check` is the gate, and nothing runs it» de «Superseded»

## Decisión

1. **Vercel despliega lo que produce `npm run build`, y la puerta va dentro.** `vercel.json` no define `buildCommand`, así que Vercel ejecuta el script `build` de `package.json`, que encadena con `&&`:
   1. `npm run check`, cuyo `precheck` ejecuta antes `content:build` (ver [generado en build](../contenido/generado-en-build.md));
   2. `vite build`, con sus propias aserciones sobre el artefacto (presupuestos, secretos, higiene de la salida);
   3. `npm run blog:preview`, la captura del blog, que nunca falla (ver [captura de la página](../blog/captura-de-la-pagina.md));
   4. `npm run check:publication`, que verifica otra vez el `dist/` final (ver [salida verificada](salida-verificada.md)).
2. **`npm run check` es la puerta sin empaquetar:** `typecheck`, `test` (Vitest) y `check:harnesses`. La lista de harnesses vive solo en el script `check:harnesses` de `package.json`.
3. **Cualquier fallo detiene el despliegue**, y Vercel sigue sirviendo el anterior.
4. **No hay vía de escape para tests ni harnesses.** No existe `VERTIGO_SKIP_TESTS`. La única, `VERTIGO_SKIP_BUDGETS`, se salta las aserciones del bundle y sirve solo para inspeccionar en local un bundle que la aserción abortó; con `VERCEL` definida, `vite.config.ts` se niega a construir (ver [JS inicial de la portada](js-inicial-de-la-portada.md)).
5. **Un harness que no puede fallar no es un harness.** El código de salida lo decide un solo sitio, `finish()` en `checks/lib/assert.ts`, que cuenta las aserciones en vivo. Todo `checks/*.ts` lo llama.
6. **Lo que se salta, se salta en voz alta.** `check:studio` (`checks/studio-typecheck.mjs`) no usa `finish()`: pasa hacia arriba el código de salida del Studio, y termina en verde con un aviso cuando faltan sus dependencias, que es siempre el caso en Vercel.
7. **Playwright no está en la puerta.** `npm run e2e` es local (ver [niveles de prueba](niveles-de-prueba.md)).

## Por qué

Hasta el 2026-08-13 las aserciones existían pero no las ejecutaba nada, y `check:navigation` imprimía fallos con código de salida 0. Una aserción que nadie ejecuta es un comentario; una que no puede fallar es una mentira. Ponerlas en el build que Vercel ejecuta es lo único que garantiza que corren.

`check:publication` va al final porque la captura del blog escribe en `dist/` después de la verificación de Vite.

`check:studio` se salta porque el Studio es un paquete aparte y Vercel solo instala la raíz: el despliegue de la web no debe depender de su árbol de dependencias.

Coste aceptado: un harness sensible al ajuste está en el camino de despliegue, y retocar una constante de escena puede dejar un despliegue en rojo.

## Qué se descartó

- `VERTIGO_SKIP_TESTS`: una vía de escape en la puerta es la puerta.
- Un `buildCommand` en `vercel.json`: sería una segunda receta que puede divergir de `package.json`.
- Que `check:studio` falle sin el Studio instalado.
- Playwright en el build: el contenedor de Vercel no tiene servidor contra el que probar, y cada despliegue sería más lento y frágil.

## Se ha roto si…

- Un test o un harness falla y `vite build` se ejecuta igualmente. Sin test: se comprobó a mano forzando un fallo de cada tipo (2026-08-13).
- Un `checks/*.ts` encadenado no llama a `finish()`, o imprime fallos y sale con 0. Sin test.
- Un build en Vercel con `VERTIGO_SKIP_BUDGETS` no falla. Sin test.
- Aparece un `buildCommand` en `vercel.json`, o un paso nuevo escribe en `dist/` después de `check:publication`. Sin test.
- `check:studio` falla en Vercel por falta de dependencias.

## Afecta a

`package.json` (`build`, `precheck`, `check`, `check:harnesses`, `check:publication`, `blog:preview`), `checks/lib/assert.ts`, `checks/*.ts`, `checks/studio-typecheck.mjs`, `scripts/check-publication.ts`, `vite.config.ts` (rechazo de `VERTIGO_SKIP_BUDGETS`), `vercel.json`
