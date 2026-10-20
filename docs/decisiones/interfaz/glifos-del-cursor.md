# Los glifos del cursor: path data incrustado, blanco con borde negro

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`) · **Sustituye a:** DECISIONS §26.17

## Decisión

1. **Las tres manos (abierta, señalando y puño) son path data incrustado en `src/components/CustomCursor.tsx`.** No se descargan. Las tres están siempre en el DOM y el CSS las funde según `data-state` y `data-pressed`.
2. **La fuente de los glifos es ese path data.** No hay archivo de diseño en el repo: para redibujar una mano se pega el `d` nuevo en el componente.
3. **Dos propiedades no se «limpian»:**
   - **relleno blanco con un borde negro fino,** para que se lea sobre el cielo negro y sobre el vidrio claro del panel del caso;
   - **`fill-rule: nonzero`,** porque las divisiones de los dedos son subtrazados del mismo sentido que deben rellenarse enteros.
4. **Cada glifo lleva su punto activo** (`--hx`/`--hy` en `styles.css`): nudillos, yema del índice, parte alta del puño. Están a pocos píxeles entre sí, para que el cambio se lea como un cambio de mano y no como un deslizamiento.

## Por qué

- Para un cursor, un 404 o un parpadeo en el primer hover no es un fallo de estilo: es quedarse sin puntero visible.
- Un único glifo tiene que leerse sobre fondos opuestos.

## Qué se descartó

- Cargar los SVG en tiempo de ejecución.
- Una silueta blanca sin borde.
- `fill-rule: evenodd`, que agujerea los dedos.
- Una brújula en el cursor (ver [brújula](../murcia/brujula.md)).

## Se ha roto si…

- La mano se ve deshilachada (falta `nonzero`) o desaparece sobre el panel del caso (falta el borde). Solo visual.
- El cambio de glifo «salta» al pulsar: los puntos activos se han separado. Solo visual.

## Afecta a

`src/components/CustomCursor.tsx`, `src/styles.css` (`.cursor-hand*`, `.cursor-follow-core`)
