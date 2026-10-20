# Ciclo de vida de las experiencias: ambas montadas, congeladas, nunca reconstruidas

**Estado:** vigente · **Desde:** 2026-08-07 · **Sustituye a:** DECISIONS §4 y ADR 003

## Decisión

1. **Earth y Murcia siguen montadas toda la sesión.** Ninguna transición construye ni destruye un mundo: Murcia se construye una sola vez por vida del canvas.
2. **Desactivar es congelar, no reiniciar.** Cada puerta es un retorno temprano. Al volver, los relojes, el giro de la superficie y el rumbo y el foco de Murcia siguen donde estaban.
3. **Excepciones a lo anterior:**
   - El **zoom** se reinicia en cada corte (ver [banda de zoom y commit](../navegacion/banda-de-zoom-y-commit.md)).
   - **Earth vuelve a la vista general**, no a la pose en la que el visitante la dejó, y es intencionado (confirmado 2026-10-20). El rig de Earth se desactiva al salir y `activate()` lo resiembra desde la pose general al volver.
4. **El mundo activo es estado de React** (`activeExperience` en `src/App.tsx`), y el corte lo cambia.

## Por qué

Reconstruir un mundo al entrar supone volver a subir geometría y recompilar shaders justo cuando el visitante está mirando. El precio es que la VRAM máxima contiene los dos mundos; está aceptado y acotado.

## Qué se descartó

Que Earth recupere la pose en la que la dejó el visitante, como decían ADR 003 y §4.

## Se ha roto si…

- `e2e/blog.spec.ts` ve más de una construcción de la ciudad (`__vertigoMurciaBuilds`).
- Fallan los tests de reclamaciones de `CameraRig.test.ts` o `check:campus` §6b.

## Afecta a

`src/App.tsx`, `src/experiences/murcia/MurciaLayer.tsx`, `src/experiences/murcia/MurciaExperience.ts` (`setActive`), `src/experiences/earth/interaction/InteractionLayer.tsx`, `src/experiences/earth/camera/createFocusCameraRig.ts`
