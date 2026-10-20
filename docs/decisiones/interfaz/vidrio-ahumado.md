# La interfaz superpuesta es un único vidrio ahumado en tres densidades

**Estado:** vigente · **Desde:** 2026-09-06 (`24f03ce`, aprobado sobre un lienzo en `design/smoked-glass/`); una barra de scroll para todo el sitio desde el 2026-09-23 (`58ceb6b`, `460ccc7`) · **Sustituye a:** DECISIONS §37, salvo el azul ([uso del azul](uso-del-azul.md)) y los campos ([campos como líneas](campos-como-lineas.md)); las filas «The audit section is an opaque curtain» y «The emitter hairline is the site's signature…» de «Superseded»

## Decisión

1. **Un material para toda la interfaz superpuesta:** grafito oscuro translúcido, desenfoque moderado, un borde frío casi invisible, una película de luz reflejada arriba y una sombra neutra profunda. Ahumado, no esmerilado, y no es un HUD.
2. **Tres densidades: cuanto mayor la superficie, más discreto el vidrio.**
   - **A**, bandeja flotante (`--glass-bg-light`; `--glass-bg-light-dense` para la brújula en pantallas estrechas): placa de consentimiento, [brújula](../murcia/brujula.md) y fondo del interruptor de sonido. Se separa por la sombra.
   - **B**, placa compacta (`--glass-bg`): panel del caso y panel del campus.
   - **C**, panel pesado (`--glass-bg-heavy`): contacto, textos legales, cortina de auditoría y degradado inferior de la capa del menú.
3. **Los tokens viven en el `:root` de `src/components/siteHeader.css`,** la única hoja que cargan todos los documentos. Ninguna otra hoja declara `:root`, y las hojas de panel leen el color de los tokens.
4. **El blog hereda los tokens y no los consume:** su superficie es papel. De los tokens del sitio solo lee `--header-control`.
5. **Sin `backdrop-filter`, un único bloque `@supports`** vuelve casi opacas las tres densidades sin perder su orden.
6. **Una sola capa desenfocada por panel:** nada de `backdrop-filter` animado ni apilado. Cada uno va con su `-webkit-backdrop-filter`.
7. **Sin línea emisora azul.** Donde la línea decía algo (el estado «enviado»), sigue y es neutra.
8. **Mayúsculas solo en microetiquetas:** los disparadores de la cabecera, con tracking. Frases y botones de envío, en caja de oración.
9. **Una barra de scroll para todo el sitio**, declarada una vez en `siteHeader.css`: pulgar fino y redondeado, sin pista ni flechas. Firefox recibe el par estándar y solo Firefox. Una superficie clara reescribe los tokens del pulgar (`.blog-root`).

## Por qué

- Los paneles se habían convertido en un HUD: degradados, azul en todo y la misma línea emisora en seis hojas.
- La escala de densidades evita que un formulario grande parezca un gran efecto translúcido; la cortina deja de ser opaca para que el mundo quede detrás de las preguntas.
- Los tokens van en `siteHeader.css` porque `styles.css` nunca llega al blog.
- Chromium 121+ respeta `scrollbar-width`/`scrollbar-color` y, si alguno está puesto, ignora `::-webkit-scrollbar` y devuelve las flechas en Windows.

## Qué se descartó

- Vidrio esmerilado, brillos exteriores, degradados del CTA y la línea emisora como firma.
- Una cortina de auditoría opaca.
- Vidrio dentro de vidrio.
- Un sistema de diseño completo: son unas dos docenas de tokens, cada uno con su consumidor.

## Se ha roto si…

Sin test; lo dicen la inspección y estas búsquedas: otra hoja declara `:root`; `blog.css` lee un `--glass-*`; un `backdrop-filter` sin `-webkit-`; un panel con un literal de color en lugar de un token (hoy hay varios: ver [uso del azul](uso-del-azul.md), «Qué queda abierto»); un componente pone `scrollbar-width` o `scrollbar-color`. La bandeja del [holograma](../earth/holograma-de-marca.md) copia a mano la densidad A.

## Afecta a

`src/components/siteHeader.css`, `src/styles.css` (`.case-panel`), `src/components/auditSection.css`, `src/components/modal.css`, `src/components/contactSection.css`, `src/components/legalPanel.css`, `src/components/consentBanner.css`, `src/components/claimDialog.css`, `src/components/cookiePreferences.css`, `src/components/siteMenu.css`, `src/experiences/murcia/styles/murcia.css`, `src/blog/blog.css`, `design/smoked-glass/`
