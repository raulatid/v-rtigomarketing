# El panel del caso: lateral en escritorio, hoja inferior en móvil

**Estado:** vigente · **Desde:** 2026-08; altura acotada por el logo desde 2026-09-17 (`fdc406e`); entrada animada desde el 2026-10-21 (`0544393`) · **Sustituye a:** DECISIONS §26.19

## Decisión

1. **Por debajo del punto de corte, el panel es una hoja inferior.** El punto de corte es la media query de `src/styles.css` (ancho máximo **o** alto máximo), emparejada con `CASE_PANEL_DOCK_MIN_WIDTH`/`_HEIGHT` y `isPhoneViewport` en `closeUpFraming.ts`. Un móvil en horizontal también recibe la hoja.
2. **La hoja tiene dos paradas, `peek` y `expanded`, y cada selección nueva se abre en `expanded`.**
3. **Las alturas se calculan en vivo** (`caseSheetLayout`): la máxima nunca tapa el logo proyectado del satélite, y se vuelven a medir cada fotograma desde su borde inferior. Mientras no hay sitio, la hoja espera (`data-sheet-waiting`).
4. **La cámara nunca se reencuadra por la hoja.**
5. **El contenido llega por bloques al abrir cada caso:** título, meta, métricas, resumen, detalles, gráfica y siguiente paso, con 55 ms entre uno y otro (`case-reveal` en `styles.css`). El cuerpo lleva como `key` el id del caso, así que la entrada se repite al cambiar de satélite con el panel abierto, y no al cerrarlo.
6. **Cada métrica cuenta hasta su valor** en unos 900 ms con frenada final (`MetricValue` en `CasePanel.tsx`). Solo cuenta el primer número del texto editorial y conserva su notación: signo, unidad, decimales y separadores (`metricCount.ts`). Un valor sin número aparece tal cual. La copia escrita, transparente, fija el tamaño de la tarjeta y es la que oye el lector de pantalla.
7. **El panel no atiende al movimiento reducido** (desde el 2026-10-21): la cascada, el conteo, las gráficas, el fundido del panel y la flecha del siguiente paso se animan igual para todos. Es texto y datos que llegan una vez, sin bucles ni desplazamientos grandes, y la versión reducida no aportaba nada y dejaba saltos visuales.

## Por qué

- Una hoja de una sola parada tapaba su propio satélite.
- Un móvil en horizontal recibía un panel lateral de 820 px.
- El logo tiene que seguir viéndose por encima de la hoja.

## Qué se descartó

Una hoja única de altura fija, una media query solo por ancho, abrir en `peek` y reencuadrar la cámara al expandir.

## Se ha roto si…

- Fallan `src/interaction/caseSheetLayout.test.ts` o `closeUpFraming.test.ts` («sits exactly on the constants it is named for»).
- Fallan `src/components/metricCount.test.ts` o el bloque «the metric count-up» de `src/components/CasePanel.test.tsx`.
- En e2e falla `mobile.spec.ts`: hoja y no columna de 142 px, se abre expandida, horizontal recibe la hoja, la cabecera no se mueve.

## Afecta a

`src/components/CasePanel.tsx`, `src/components/metricCount.ts`, `src/interaction/caseSheetLayout.ts`, `src/experiences/earth/camera/closeUpFraming.ts`, `src/experiences/earth/orbit/billboardBounds.ts`, `src/styles.css`
