# Límites de la cámara de Murcia

**Estado:** vigente · **Desde:** 2026-09-10 · **Sustituye a:** DECISIONS §39 (rectángulo limitado por el ojo), §40 (banda de resistencia) y §44 en lo que dice de los límites

## Decisión

1. **Solo se limita el objetivo de navegación, no el ojo.** El objetivo queda dentro de un único rectángulo: el anillo A2 (`CITY_A2`, usado como `navigation.bounds` en `src/experiences/murcia/config/murciaConfig.ts`). Es el suelo que el GLB realmente contiene, medido del propio modelo.
2. **No hay resistencia en el borde.** El objetivo se detiene en el rectángulo.
3. **Lo que garantiza que el mundo rodea a la cámara es `checks/footprint.ts`**, que barre toda la banda de zoom y todas las proporciones de pantalla. Es la garantía exterior y la única.

## Por qué

- El sandbox ampliaba su placa 50 unidades fijas, pero esa cifra pertenece a su escena de prueba. En Murcia el suelo construido sobresale de la placa de forma desigual por cada lado, así que 50 fijas habrían dejado al visitante sobre la nada en tres de los cuatro lados.
- El rectángulo limitado por el ojo (§39) y la banda de resistencia (§40) exigían unas 1 400 líneas de código y tests (`DragPanController`, `NavigableArea`) que ya no existen.

## Se ha roto si…

- `npm run check:footprint` falla.
- `npm run check:navigation` falla en §6 (el objetivo se queda dentro del rectángulo).
- `npm run check:asset` (sección 7b de `checks/city-asset.ts`) falla: el GLB publicado ya no contiene el anillo A2.

## Afecta a

`src/experiences/murcia/config/murciaConfig.ts` (`CITY_A2`, `navigation.bounds`), `src/experiences/murcia/camera/CameraRig.ts`, `src/experiences/murcia/navigation/navigationBounds.ts`, `checks/footprint.ts`, `checks/city-asset.ts`
