# La figura de un servicio dibuja lo que argumenta su texto, y la elige el editor

**Estado:** vigente · **Desde:** 2026-09-15 (`ad21948`), decidido con el usuario; figuras en volumen desde el 2026-09-16 (`ed353ff`); el giro cuenta desde la entrada en el servicio desde el 2026-09-17 (`afc0bf1`); las elige el editor desde el 2026-09-21 (`3e20535`), y ese día llega el quinto símbolo (`5271246`); la leyenda no se muestra desde el 2026-09-16 (`e495f51`) · **Sustituye a:** DECISIONS §52

## Decisión

1. **En cada servicio, las partículas forman primero un símbolo y después, una sola vez, su figura, y se quedan en ella.** El giro empieza a `figureDelay` de la entrada en el servicio, nunca antes de que terminen el vuelo y el morph (`timing` en `attachServicesCampus.ts`). La figura se dibuja en orden (`figureSpread`).
2. **Símbolos:** `CAMPUS_SYMBOLS` en `src/content/campusShapes.ts`, dibujados como SVG en `content/campusIcons.ts`. Son marcas neutras y provisionales hasta que llegue el arte definitivo. Tienen valor por defecto (`DEFAULT_CAMPUS_SYMBOL`).
3. **Figuras:** `CAMPUS_FIGURES`, construidas en `particles/figureLayouts.ts` como diagramas abiertos en volumen. Cada una dibuja un mecanismo: `compound`, algo que se acumula; `segments`, un total que se reparte; `funnel`, muchos entran y pocos llegan; `path`, pasos en orden; `repeat`, el propio símbolo repetido, que se construye con sus muestras. No tienen valor por defecto.
4. **Esquemáticas, nunca datos:** ninguna figura lleva valores, escala ni ejes.
5. **Las elige el editor** en el documento del servicio (`symbol`, `figure`), entre las listas cerradas; ver [qué decide el editor](../contenido/que-decide-el-editor.md). Un servicio sin figura conserva su símbolo y no se transforma: es un hueco, no un error.
6. **Los puntos destacados (`measures`) aparecen cuando la figura empieza a formarse**, o en el momento en que lo haría si el servicio no tiene figura.
7. **No hay leyenda.** `figureCaption` está oculto en el Studio («Leyenda anterior de la figura») y la placa no lo recibe, aunque el build lo valida y `campusContent.ts` lo sigue calculando.
8. **Con movimiento reducido, el giro también ocurre:** corto y con la figura quieta (ver [partículas y movimiento reducido](particulas-y-movimiento-reducido.md)).
9. **No hay rótulos en la escena** sobre las partículas.

## Por qué

- El cliente pidió gráficas porque las placas «solo tenían texto». La gráfica que ya había era decoración: alturas constantes, una suma de senos y dos servicios con la misma. La condición del usuario fue no añadir nada por añadir (§52).
- Sin datos porque no existe ningún resultado medido, y una gráfica que lo pareciera sería una afirmación que el cliente tendría que retirar (§52).
- Las elige el editor porque, con la tabla por slug de `cityDistrictBindings.ts`, publicar un servicio exigía un cambio de código, y reescribir un texto bajo el mismo slug dejaba la figura dibujando el texto anterior con todos los tests en verde. El 2026-09-21, cuatro de los cinco servicios estaban así (`3e20535`).
- La asimetría: una parada tiene que formar algo, y un símbolo no afirma nada del servicio; una figura que nadie eligió afirmaría un mecanismo que nadie escribió (`campusShapes.ts`).
- La figura se queda porque es contenido (§52; comentario de movimiento reducido en `createServicesCampus.ts`).
- Los puntos destacados salen a su hora aunque no haya figura porque, si no, un servicio sin figura perdería también sus puntos (`3e20535`).
- El quinto símbolo: con cuatro marcas para cinco servicios, un servicio tenía que llevar la marca de otro (`5271246`).
- Quitar la leyenda de la placa (`e495f51`) no tiene porqué registrado.

## Qué se descartó

- Una gráfica dentro de la placa (duplicaría la figura de al lado), figuras con números y rótulos en la escena (§52).
- Las cuatro figuras anteriores (`bars`, `ring`, `pins`, `line`) y el vaivén entre símbolo y figura cada pocos segundos.
- Las filas de símbolo y figura por servicio en `cityDistrictBindings.ts`.
- Escribir en Sanity las figuras antiguas al hacer el cambio: los servicios se publicaron sin figura y el editor elige al revisar cada uno (`3e20535`).
- Una figura por defecto.

## Se ha roto si…

- Falla `particles/figureLayouts.test.ts` («… stays within its framing and is stationary with reduced motion»).
- Falla `content/campusIcons.test.ts`: se ofrece un nombre sin dibujo, o el de por defecto no existe.
- Falla `campusContent.test.ts`, bloque «a service with no figure».
- Falla `content/collections/collections.test.ts` («a symbol or a figure the campus cannot draw», «resolve an absent or blank symbol to the default, and an absent figure to none», «let a whole section publish with no figure chosen anywhere»).
- Falla `section/campusOverlay.test.ts` («reveals highlights with the figure and resets them when changing service»).
- Una figura gana un valor o un eje, o se reescribe un texto sin revisar su figura: revisión humana.

## Afecta a

`src/content/campusShapes.ts`, `src/experiences/murcia/campus/particles/figureLayouts.ts`, `src/experiences/murcia/campus/particles/layouts.ts`, `src/experiences/murcia/campus/content/campusIcons.ts`, `src/experiences/murcia/campus/content/servicesContent.ts`, `src/experiences/murcia/campus/campusContent.ts`, `src/experiences/murcia/campus/attachServicesCampus.ts`, `src/experiences/murcia/campus/section/campusOverlay.ts`, `sanity-studio/schemas/service.ts`, `content/collections/districts.collection.ts`
