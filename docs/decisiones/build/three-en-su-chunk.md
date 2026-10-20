# three.js va en su propio chunk y solo se alcanza con un import dinámico

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, `manualChunks`); aserción estructural desde el 2026-08-31 (`ac8c88d`) · **Sustituye a:** ADR 002, «Consequence discovered afterwards»; la detección de three por el tamaño de la entrada (DECISIONS §31)

## Decisión

1. **`manualChunks` fija todo `node_modules/three/` en un chunk llamado `three`.**
2. **La entrada de la app no puede importar ese chunk de forma estática.** three llega a `/` solo por el import dinámico de `LazyScene`. El build lo comprueba sobre el grafo de chunks emitido.
3. **Ningún otro módulo se fija con `manualChunks`.**
4. **Un módulo que la entrada necesita no importa nada que importe three, ni para leer una constante:** las constantes van en un módulo sin three (`galaxyBandConfig.ts`, que lee `introConfig.ts`).

## Por qué

- three apenas cambia entre despliegues. Con su propio hash, un visitante que vuelve no lo descarga otra vez tras un cambio de código de la app. Como los dos chunks se precargan juntos, separarlos no cuesta nada en frío.
- Sin `manualChunks`, dónde acaba three es un accidente del grafo: con un solo consumidor dinámico, Rollup lo mete entero en el chunk de `SceneCanvas`.
- Una arista estática no añade descarga, porque three se precarga igual, pero sí **evaluación**: la librería entera se ejecuta en el hilo principal antes que la entrada, y por tanto antes de que React pinte.
- La comprobación anterior (buscar un símbolo de three en el código de la entrada) era cierta por construcción una vez existía `manualChunks`, y no vio una importación estática real de tres constantes numéricas.

## Qué se descartó

- Dejar que Rollup decida dónde va three.
- Detectar three por el tamaño de la entrada o por un símbolo en su código.
- Fijar `src/corner-logo/` como chunk manual: arrastró `utils/easing`, que usa la entrada, y la entrada ganó una importación estática de un chunk que importa three. Un chunk manual no es una valla, es un imán.

## Se ha roto si…

- `vite build` falla con «the app entry statically imports …, so all of three.js is evaluated during boot, before React renders».
- three aparece en un chunk que no se llama `three`: la aserción no lo ve. Sin test.
- Un chunk inicial distinto de la entrada importa three de forma estática: la aserción solo mira la entrada. Sin test.

## Afecta a

`vite.config.ts` (`manualChunks`, `assertChunkBudgets`), `src/components/LazyScene.tsx`, `src/experiences/earth/config/introConfig.ts`, `src/experiences/earth/scene/space/galaxyBandConfig.ts`, `src/corner-logo/CornerLogoLayer.tsx`
