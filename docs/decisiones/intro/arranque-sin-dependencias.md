# El código que arranca primero no depende de nada

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** DECISIONS §26.4 y los presupuestos de tamaño citados en PROJECT_MEMORY §9

## Decisión

1. **El dibujo de arranque es un módulo independiente con su propia entrada** (`src/intro-draw/boot.ts`), que el plugin `introEntry()` de `vite.config.ts` inyecta al principio del `<head>`.
2. **El chunk de arranque no puede tener imports, ni estáticos ni dinámicos, y debe caber en `INTRO_BUDGET_BYTES`.** Ambas cosas se comprueban sobre el chunk emitido durante `vite build`. El worker del dibujo tiene el suyo, `DRAW_WORKER_BUDGET_BYTES`; los demás presupuestos de JS están en [JS inicial de la portada](../build/js-inicial-de-la-portada.md).
3. **`src/intro-draw/` no importa nada de fuera de sí mismo**, incluido el worker de dibujo.
4. **La app solo habla con el arranque a través de globales** (`window.__vertigoIntro`, `__vertigoBootState`) e imports solo de tipos.
5. **Las capturas de movimiento reducido y de visita que vuelve se hacen una vez en el arranque** y se entregan a la app. Solo el arranque y `platform/motionPreference.ts` pueden consultar `prefers-reduced-motion`.
6. three.js, R3F y la escena llegan después, tras `LazyScene`.

## Por qué

El dibujo tiene que estar en pantalla antes que nada, y evaluar un módulo bloquea el hilo principal.

## Qué se descartó

Meter el chunk de arranque en línea dentro del documento: se probó en A/B y perdió, sobre todo con conexiones lentas. Las medidas están en el comentario de `vite.config.ts`.

## Se ha roto si…

- `vite build` falla con «intro entry must be standalone…» o por presupuesto superado.
- `npm run check:architecture` falla en §3 («intro-draw/ imports nothing outside itself») o en la regla de consultas de movimiento.
- Falla `boot.test.ts` («boots with environment %s»).

## Afecta a

`src/intro-draw/`, `vite.config.ts`, `checks/architecture.ts`, `src/loading/progress.ts`, `src/platform/motionPreference.ts`, `src/components/LazyScene.tsx`
