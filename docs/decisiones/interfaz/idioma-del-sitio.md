# El sitio está en español

**Estado:** vigente · **Desde:** 2026-08-07 (`4fe27dc`) · **Sustituye a:** DECISIONS §11

## Decisión

1. **Todo el texto que ve un visitante está en español**, también los textos de relleno: no es inglés a la espera de traducción.
2. **Los tres documentos (`index.html`, `blog.html`, `404.html`) declaran `lang="es"`.**
3. **Excepción: las etiquetas del overlay de depuración** (`?debug=1`, `DebugOverlay.ts`). Son una herramienta de desarrollo que un visitante nunca ve, y sus nombres son como se habla de esos campos en la documentación.

## Por qué

Decisión del usuario desde la unificación del proyecto. La excepción la explica DECISIONS §11: el overlay no es del visitante.

## Qué se descartó

- Texto de relleno en inglés para traducir después.

## Se ha roto si…

- Aparece texto visible en inglés fuera del overlay de depuración, o un documento pierde `lang="es"`. Sin test.

## Afecta a

`index.html`, `blog.html`, `404.html`, `src/**` (todo texto visible), `src/experiences/murcia/debug/DebugOverlay.ts`
