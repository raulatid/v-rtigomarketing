# El panel del caso: lateral en escritorio, hoja inferior en móvil

**Estado:** vigente · **Desde:** 2026-08; altura acotada por el logo desde 2026-09-17 (`fdc406e`) · **Sustituye a:** DECISIONS §26.19

## Decisión

1. **Por debajo del punto de corte, el panel es una hoja inferior.** El punto de corte es la media query de `src/styles.css` (ancho máximo **o** alto máximo), emparejada con `CASE_PANEL_DOCK_MIN_WIDTH`/`_HEIGHT` y `isPhoneViewport` en `closeUpFraming.ts`. Un móvil en horizontal también recibe la hoja.
2. **La hoja tiene dos paradas, `peek` y `expanded`, y cada selección nueva se abre en `expanded`.**
3. **Las alturas se calculan en vivo** (`caseSheetLayout`): la máxima nunca tapa el logo proyectado del satélite, y se vuelven a medir cada fotograma desde su borde inferior. Mientras no hay sitio, la hoja espera (`data-sheet-waiting`).
4. **La cámara nunca se reencuadra por la hoja.**

## Por qué

- Una hoja de una sola parada tapaba su propio satélite.
- Un móvil en horizontal recibía un panel lateral de 820 px.
- El logo tiene que seguir viéndose por encima de la hoja.

## Qué se descartó

Una hoja única de altura fija, una media query solo por ancho, abrir en `peek` y reencuadrar la cámara al expandir.

## Se ha roto si…

- Fallan `src/interaction/caseSheetLayout.test.ts` o `closeUpFraming.test.ts` («sits exactly on the constants it is named for»).
- En e2e falla `mobile.spec.ts`: hoja y no columna de 142 px, se abre expandida, horizontal recibe la hoja, la cabecera no se mueve.

## Afecta a

`src/components/CasePanel.tsx`, `src/interaction/caseSheetLayout.ts`, `src/experiences/earth/camera/closeUpFraming.ts`, `src/experiences/earth/orbit/billboardBounds.ts`, `src/styles.css`
