# R3F registra solo las clases de three que usa la app

**Estado:** vigente · **Desde:** 2026-10-16 (`aab6a3b`) · **Sustituye a:** nada documentado (antes R3F registraba el espacio de nombres entero)

## Decisión

1. **El build y el servidor de desarrollo quitan de `@react-three/fiber` la línea con la que `<Canvas>` registra todo three** (`R3F_EXTEND_ALL`, `extend(THREE)`). Lo hace el plugin `vertigo-three-catalogue` de `vite.config.ts`: en `transform` para el build y en el prebundle de dependencias (`optimizeDeps`) para el servidor de desarrollo.
2. **La app registra solo las clases que su JSX escribe como elemento** (`<mesh>`, `<group>`…), en `THREE_CATALOGUE` (`src/graphics/threeCatalogue.ts`). `SceneCanvas.tsx` las registra con `extend` al cargarse, antes de montar ningún `<Canvas>`.
3. **Si R3F cambia esa línea, el build y el servidor de desarrollo fallan**, en vez de volver a meter three entero sin avisar.
4. Lo que se crea con `new` y se pasa a `<primitive>` no necesita estar en el catálogo.
5. El catálogo no tiene sobrantes: un test exige que cada clase registrada se use como elemento en algún `.tsx` de `src/`.

## Por qué

- R3F no ofrece forma de desactivar ese registro, y esa única referencia mantenía toda la librería en el chunk `three`, se usara o no, en el JS inicial de todo visitante. Era la causa de las subidas del presupuesto del JS inicial (ver [JS inicial de la portada](js-inicial-de-la-portada.md)). El ahorro medido está en el mensaje de `aab6a3b`.
- Quitarla también en desarrollo hace que un elemento olvidado falle donde se ve, y no solo en producción.

## Qué se descartó

- Hacer selectivo el bucle de precarga (la pista que se siguió durante las subidas).
- Seguir subiendo el límite.

## Se ha roto si…

- Falla `src/graphics/threeCatalogue.test.ts` («registers every three class the JSX writes as an element», «registers nothing the JSX does not use», «registers each class under its own name»).
- `vite build` o `vite` fallan con «[vertigo-three-catalogue] … no longer contains …».
- Un elemento JSX lanza «R3F: X is not part of the THREE namespace!» al montarse.

## Afecta a

`vite.config.ts` (`threeCatalogue`, `withoutR3fExtendAll`, `R3F_CANVAS_MODULE`, `R3F_EXTEND_ALL`), `src/graphics/threeCatalogue.ts`, `src/graphics/threeCatalogue.test.ts`, `src/components/SceneCanvas.tsx`, `package.json` (`@react-three/fiber`). Frontera: la configuración del renderer es de [render](../render/configuracion-del-renderer.md).
