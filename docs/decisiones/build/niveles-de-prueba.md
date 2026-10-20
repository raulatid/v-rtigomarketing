# Tres niveles de prueba, y una regla para saber dónde va cada una

**Estado:** vigente · **Desde:** 2026-08-13 (`92cc4b4`); `scripts/` en el nivel unitario desde el 2026-08-31 (`950edce`); `server/` desde el 2026-09-04 (`84e1b28`); módulos de cobertura descubiertos desde el 2026-09-15 (`70cadaa`) · **Sustituye a:** DECISIONS §22; DECISIONS §12 en su regla general («assert it»); la fijación de Vite de DECISIONS §13; la fila «The repo has no test runner» de «Superseded»

## Decisión

1. **Unitario (Vitest):** lógica sin escena, junto a su módulo, como `*.test.ts` o `*.test.tsx`. El `include` de `vitest.config.ts` lo hace mecánico: `src/`, `content/`, `scripts/` y `server/`, nunca `checks/`. El entorno es `node`; jsdom se activa por archivo con `// @vitest-environment jsdom`.
2. **Harness (`checks/`):** ejecuta los módulos reales de three durante muchos fotogramas o barre miles de poses. Se empaqueta con esbuild y se ejecuta con Node. Cada harness llama a `finish()` (`checks/lib/assert.ts`) y tiene su `check:<nombre>` encadenado en `check:harnesses`. Si no está en esa cadena, no protege nada.
3. **Humo (Playwright, `e2e/`):** local y nunca puerta de despliegue. Corre contra `vite preview`, nunca contra el servidor de desarrollo, en serie y solo en Chromium. Los dos proyectos móviles son Chromium con perfil de dispositivo: emulan una forma, no Safari.
4. **Reglas de un harness:**
   - ejercita el camino real, nunca un sustituto cómodo;
   - contrasta su medida con la función que se publica;
   - se valida contra un número registrado antes de confiar en él;
   - una aserción que falla es una pregunta, no un veredicto.
5. **Lo visual se mira.** Los niveles prueban el mecanismo (signo, límite, magnitud, no regresión). Si algo se ve o se siente bien lo juzga una persona sobre una captura o en un dispositivo.
6. **La cobertura es una puerta manual y acotada.** `npm run test:coverage` mide solo los módulos de `src/` con un test del mismo nombre al lado (`coverageModules` en `scripts/coverageModules.ts`), con los umbrales de `coverage.thresholds` en `vitest.config.ts`. Ni `check` ni `build` la ejecutan.
7. **Versiones fijadas a propósito:** Vite en 5 y Vitest en 3. Vitest 4 trae su propio Vite, y el nivel unitario y el build deben usar el mismo empaquetador. Subir de versión se hace en una pasada de verificación propia.
8. **Sin ESLint.**

## Por qué

Los harnesses vigilan fallos invisibles en la máquina donde se hace el cambio, como un borde del mundo que solo aparece en ultrapanorámico; un ejecutor rápido de funciones puras los haría peores. La lógica barata no tenía cobertura porque escribir un test exigía montar a mano una aserción y un esbuild: de ahí el nivel unitario.

Un jsdom global daría `window` a todo el código y escondería una dependencia accidental del DOM en el chunk de arranque.

`scripts/` y `server/` son código de Node que nunca va al navegador. `server/` vive fuera de `api/` porque Vercel publica como ruta cualquier archivo de `api/`.

Playwright no es puerta porque el contenedor de Vercel tendría que descargar navegadores y no tiene servidor contra el que probar. La captura del blog sí descarga Chromium en Vercel, pero no para tests.

Cobertura acotada: una cifra de todo el repositorio la dominaría la superficie WebGL, que no se puede testear, e invitaría a escribir tests para mover un número. Que siga siendo manual es decisión del usuario.

## Qué se descartó

- Portar `checks/` a Vitest.
- jsdom global.
- Cobertura de todo el repositorio, y cobertura dentro de `check` o `build`.
- ESLint: un script `lint` vacío sería una puerta que no existe.
- Vitest 4 mientras Vite siga en 5.
- Probar en WebKit: no está instalado, y ningún cambio de configuración cierra el hueco de Safari en iOS. Lo cubre solo una matriz de dispositivos a mano (`docs/audits/reports/ios-safari-2026-08-14.md`).

## Se ha roto si…

- `npm ls vite` muestra más de un Vite. Sin test.
- Aparece un `*.test.ts` dentro de `checks/`, o un `checks/*.ts` deja de llamar a `finish()`. Sin test.
- Un harness imprime fallos y `npm run check` termina con 0. Sin test.
- Un `*.test.tsx` no se recoge, o un test pasa porque tiene un `window` global que no pidió.
- Falla `scripts/coverageModules.test.ts`.
- Un archivo de `checks/` hace de prueba sin estar en `check:harnesses`. Hoy pasa con `checks/campus-sheet.mjs`, que además falla (ver [trampas](../../trampas/build.md)), y, a propósito, con el `check:asset` completo (ver [contrato del GLB](contrato-del-glb.md)).

## Afecta a

`vitest.config.ts`, `scripts/coverageModules.ts`, `playwright.config.ts`, `checks/`, `checks/lib/assert.ts`, `e2e/`, `package.json` (`test`, `test:coverage`, `check:*`, `e2e*`). Las reglas de dependencias que vigila `check:architecture` siguen en `ARCHITECTURE.md` §17; el contrato que vigila `check:audit`, en `docs/audits/README.md`.
