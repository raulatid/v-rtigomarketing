# Las partículas salen del lago; con movimiento reducido se quedan quietas y dicen lo mismo

**Estado:** vigente · **Desde:** 2026-09-11 (`a7b4a3e`); subida corta desde ese día (`08da8dd`); dos tonos desde el 2026-09-11 (`9e041c5`), con mayoría blanca desde el 2026-09-16 (`40cda0c`); volumen y giro continuo desde el 2026-09-16 (`ed353ff`, `e495f51`); precalentado desde el 2026-09-23 (`7f2ca49`); quietas sin volver a subir destinos desde el 2026-10-08 (`ca28ed3`) · **Sustituye a:** DECISIONS §45 (en parte: «a particle field rises out of the lake into a disc»); el punto 3 de §52 lo recoge [figuras](figuras-que-argumentan.md)

## Decisión

1. **Hay un solo campo de partículas** (`particles/particleField.ts`): un `Points` cuyas posiciones, retardos y tonos se escriben una vez; el shader decide cuándo y cómo se mueve cada una. Todos los tamaños se escalan desde el radio del lago (`lake/lakeBasin.ts`). Número, tamaño, oleaje y tiempos: `particles` y `shapes` en `attachServicesCampus.ts`.
2. **Al entrar,** las partículas suben del agua y forman un disco (`discLayout`), en dos tramos (`emergenceSeconds`, `convergenceSeconds`). El texto de la intro espera a que se asiente la última.
3. **Cada paso es un morph** de todo el campo hacia el destino nuevo (`timing.morph`): disco, símbolo o figura. El color cambia con la forma, en el mismo morph.
4. **Dos tonos:** unas partículas en blanco y otras (`accentShare`) en el color de la parada, que viene de Sanity (ver [contenido](contenido-y-composicion.md)).
5. **En reposo,** el campo gira despacio alrededor del eje del lago (`rotationSpeed`), con una fase continua entre formas; el disco ondula; símbolo y figura respiran y se mueven a lo largo de sí mismos (`figureMotion`). Con el campo oculto, el giro no avanza.
6. **El campo nace oculto, y `warm()` lo revela solo para compilar** (`precompileTargets`; ver [trampas de transición](../../trampas/transicion.md), n.º 20).
7. **Con movimiento reducido** (la preferencia se lee una vez por documento, `prefersReducedMotion`), `createServicesCampus.ts` pone los tiempos de `REDUCED`:
   - los vuelos son casi cortes, y la subida y los morphs terminan casi al empezar;
   - no hay oleaje, ni giro, ni movimiento de figura (`figureMotion.amplitude` a cero), ni capa viva que recalcule destinos en cada fotograma;
   - el símbolo sigue convirtiéndose en su figura, una vez, con un morph corto y sin dibujo en orden;
   - el texto sigue cada paso; sus fundidos CSS pasan a casi nada (`murcia.css`);
   - los edificios no parpadean ([edificios interactivos](../murcia/edificios-interactivos.md)); la tira LED sigue deslizándose ([tira LED](tira-led.md)).

## Por qué

- Lo que pasa por partícula lo decide la GPU, así que el número es un mando de rendimiento y no un coste de CPU por fotograma (`particleField.ts`).
- Escalar desde el lago hace que una reexportación a otro tamaño arranque con proporciones sensatas (`attachServicesCampus.ts`; [contrato de exportación](../../murcia/blender-export-contract.md), §6.9).
- Subida corta: con los tiempos del laboratorio, el texto de la intro tardaba tanto que la sección parecía atascada (`08da8dd`).
- Movimiento reducido: se va el movimiento cinematográfico, no lo que hay en pantalla; la figura es contenido (`createServicesCampus.ts`).
- Sin capa viva: con la amplitud a cero, cada destino es igual al del instante cero, y recalcular y subir todos los destinos en cada fotograma no cambiaba nada (`ca28ed3`).
- Precalentado: el programa del campo se compilaba en el primer fotograma de la llegada a Murcia (`7f2ca49`).
- La proporción de blanco: sin porqué registrado (`40cda0c`).

## Qué se descartó

- Los tiempos de subida del laboratorio.
- Mitad blanco, mitad color (`9e041c5`, cambiado en `40cda0c`).
- Quitar con movimiento reducido el giro del símbolo a la figura (lo hacía `c050313`).
- Seguir subiendo destinos en cada fotograma con el movimiento a cero.

## Se ha roto si…

- Falla `particles/particleField.test.ts` («skips drawing the hidden field and restores it on playback or seeking», «advances at the same constant rate at 30, 60 and 120 fps», «keeps its phase through a shape change and pauses while hidden», «removes the turn for reduced motion without changing the layout»).
- Falla `particles/figureLayouts.test.ts` («… is stationary with reduced motion»).
- Falla `src/experiences/murcia/core/whileRevealed.test.ts`.
- Densidad, color y ritmo se juzgan mirando; sin test.

## Afecta a

`src/experiences/murcia/campus/particles/` (todo), `src/experiences/murcia/campus/lake/lakeBasin.ts`, `src/experiences/murcia/campus/attachServicesCampus.ts`, `src/experiences/murcia/campus/createServicesCampus.ts` (`REDUCED`), `src/platform/motionPreference.ts`, `src/experiences/murcia/MurciaExperience.ts` (`warm`), `src/experiences/murcia/styles/murcia.css`
