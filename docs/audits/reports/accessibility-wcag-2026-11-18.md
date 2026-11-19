# Accesibilidad del sitio: auditoría WCAG 2.2 AA

**Fecha:** 2026-11-18. **Base:** `9bd74a4`; el árbol de trabajo solo tenía cambios en `docs/`. **Brief:** no existe ninguno para accesibilidad; el método está en el §2. **Precedentes:** ninguno. Es la primera pasada de esta línea. Las auditorías de móvil (`mobile-responsiveness-2026-09-02.md`) y de casos límite tocan el teclado de pasada, pero no lo evalúan.

**Etiquetas:**
- **verificado** = reproducido con Playwright contra la build de esta pasada;
- **código** = deducido leyendo el código, sin reproducir;
- **sin verificar** = hipótesis razonada que necesita una prueba que aquí no se hizo.

Nada de lo que propone este informe está aplicado.

---

## 1. Resumen

**El sitio no cumple WCAG 2.2 AA, y las herramientas automáticas no lo ven.** Lighthouse da 100 en accesibilidad a `/` y axe-core solo encuentra una regla de buenas prácticas (`region`). Las razones de fondo son tres:
- el contenido principal vive en un canvas WebGL;
- hay caminos completos que solo existen para el puntero;
- el foco se pierde en casi cada transición.

Ninguna de las tres la puede medir una herramienta que analiza el DOM.

**Lo que bloquea** (detalle en el §4):

1. **Los casos de éxito de la Tierra no se pueden abrir con teclado ni con lector de pantalla** (T1). Son el contenido central del sitio, y la decisión vigente dice que esto «no es deuda» (`docs/decisiones/interfaz/picking-por-coordenadas.md`). Un lector de pantalla ni siquiera sabe que existen.
2. **La sección Conócenos no tiene entrada por teclado** (M1). Sus cinco frases solo existen como píxeles en la pantalla LED (M2).
3. **Sin WebGL, o si la escena falla, el sitio queda vacío** (D1): no hay forma de contactar, pedir la auditoría ni llegar al blog. Además, el rótulo de carga, que es lo único que debería anunciarse, está dentro de un contenedor `aria-hidden` (D2).
4. **El documento de la escena no tiene `h1`, `main` ni alternativa textual del canvas** (D4). Lo único que un lector de pantalla encuentra en la Tierra son cinco botones de cabecera, el pie y el banner de cookies.
5. **Los diálogos no son modales para el teclado** (F1, F2). Desde Contacto, Tab sale al fondo; la cortina de Auditoría no tiene semántica de diálogo y deja el foco caer debajo de ella.
6. **El foco cae a `<body>` en casi cada paso:**
   - al entrar y avanzar en Servicios y Conócenos (M3);
   - al enviar un formulario (F5);
   - al cerrar el panel del caso (T2);
   - al volver del blog (D7).
7. **Hay problemas visuales que solo aparecen sobre Murcia de día o con colores forzados** (V1–V4):
   - en el modo de contraste alto de Windows, los campos de los formularios pierden el borde y el foco;
   - el anillo de foco azul claro baja de 2:1 sobre los tejados;
   - la pista y el pie, sin placa, también bajan de 3:1 sobre la ciudad.

**Lo que está bien hecho:**
- La base es mejor de lo que el resumen sugiere.
- Los formularios tienen etiquetas, errores y autocompletado correctos y usan `select` nativo.
- El viaje Tierra ↔ Murcia tiene un control de teclado real (`.nav-control`).
- Servicios tiene una superficie accesible propia (`districtA11y.ts`) con región viva.
- El blog mueve el foco al `h1` en cada ruta.
- El movimiento reducido está cubierto casi en todas partes.
- No hay atajos de un solo carácter.
- Las tres páginas declaran `lang="es"` y ninguna bloquea el zoom.

El §5 lo detalla.

### Qué puede hacer hoy un usuario de teclado o de lector de pantalla

| Tarea | Teclado | Lector de pantalla | Hallazgo |
|---|---|---|---|
| Saber qué es Vertigo y qué ofrece en la portada | — | No: no hay encabezados ni texto | D4 |
| Abrir un caso de éxito | No | No | T1 |
| Ir de la Tierra a Murcia y volver | Sí (`.nav-control`, Blog, Servicios) | Sí, sin anuncio de llegada | D8 |
| Recorrer Servicios (campus) | Sí, pero el foco cae a `body` en cada paso | Sí, por la región viva | M3 |
| Entrar en Conócenos | No | No | M1, M2 |
| Explorar la ciudad libremente | No (solo arrastre) | No | M9 |
| Pedir la auditoría | Sí, con fugas de foco y Escape traicionero | Sí, con las mismas reservas | F2, F3 |
| Contactar | Sí, sin trampa de foco | Sí | F1, F5 |
| Leer el blog | Sí | Sí, con el título de pestaña equivocado | B1–B8 |
| Usar el sitio sin WebGL | No | No | D1 |

---

## 2. Cómo se midió

- **Build:** producción local en `dist/` (generada hoy después de `9bd74a4`, sin overlay de depuración), servida con `vite preview` en el puerto 4173.
- **Navegador:** Chromium 1243 de Playwright en modo headless, con WebGL por SwiftShader (`--use-angle=swiftshader`). La escena va a 0,5–4 fps, así que los tiempos absolutos no valen; los hallazgos dependientes del tiempo solo se dan cuando se repitieron con esperas largas.
- **Viewports:** 1600×900, 1440×900 y 1280×800 en escritorio; 393×852 y 390×844 en móvil (`isMobile`, `hasTouch`, DPR 3); 320×640 para reflow.
- **Herramientas:**
  - **axe-core 4.14.1**, inyectado en la página, con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` y `best-practice`. Estados medidos: intro, Tierra, cortina de auditoría, diálogo de contacto, Murcia, campus, menú móvil, blog y 404.
  - **Lighthouse 12**, categorías de accesibilidad, SEO y buenas prácticas, en `/`, `/blog`, una entrada y `/404.html`.
  - **Árbol de accesibilidad** con `ariaSnapshot` de Playwright.
  - **Recorridos de Tab:** elemento activo, caja, estilo de foco, `inert` y `aria-hidden`.
  - `elementFromPoint` para el foco tapado.
  - Contrastes calculados a mano sobre los colores computados.
  - Emulación de `prefers-reduced-motion`, `forced-colors`, `--disable-webgl` y JS desactivado.
- **Formularios:** todo `/api/**` se interceptó con `page.route`, con respuestas falsas de éxito, 422 y 502. No salió ninguna petición real.
- **Consentimiento:** el registro sembrado tiene que llevar `v: 4` (`CONSENT_VERSION` en `src/app/consent.ts`). Con un `v` anterior el banner aparece igualmente.
- **Reparto:** seis revisiones en paralelo:
  - documento y elementos globales;
  - formularios y diálogos;
  - Tierra;
  - Murcia;
  - blog;
  - capa visual.

  Más un barrido dinámico común. Los scripts y las capturas viven fuera del repositorio.
- **No se ha hecho:**
  - lectores de pantalla reales (NVDA, JAWS, VoiceOver, TalkBack): lo que se dice de ellos sale del árbol de accesibilidad;
  - Safari y Firefox;
  - dispositivos físicos;
  - autocompletado con perfiles reales del navegador.

---

## 3. Hallazgos por prioridad

Severidad: **Crítica** = impide una tarea central a un grupo de usuarios; **Alta** = la impide en parte o la hace muy difícil; **Media** = la dificulta; **Baja** = molestia o riesgo menor.

| Id | Sev. | WCAG | Resumen | Estado |
|---|---|---|---|---|
| T1 | Crítica | 2.1.1, 1.1.1, 4.1.2 | Los casos de éxito solo se abren con el puntero; no existen en el DOM | verificado |
| D1 | Alta | 1.1.1, 4.1.3 | Sin WebGL o con un error fatal: página vacía, sin contacto ni blog | verificado |
| D2 | Alta | 4.1.3 | El rótulo de carga `role="status"` está dentro de un `aria-hidden` | verificado |
| D4 | Alta | 1.1.1, 1.3.1, 2.4.6 | Sin `h1`, `main` ni texto alternativo del canvas en la escena | verificado |
| M1 | Alta | 2.1.1 | Conócenos no tiene entrada por teclado ni para lector | verificado |
| M2 | Alta | 1.1.1, 1.3.1 | Las frases de la LED de Conócenos solo existen en WebGL | verificado |
| M3 | Alta | 2.4.3 | Entrar, avanzar o salir de Servicios y Conócenos tira el foco a `body` | verificado |
| F1 | Alta | 2.4.3, 4.1.2 | El diálogo de contacto declara `aria-modal` pero Tab sale al fondo | verificado |
| F2 | Alta | 2.4.11, 2.4.3 | La cortina de auditoría no es diálogo; el foco cae bajo ella | verificado |
| B1 | Alta | 2.4.2 | El título de la pestaña no cambia con la ruta del blog | verificado |
| B2 | Alta | 2.4.3 | Anterior/Siguiente abre la entrada nueva a mitad de página | verificado |
| G1 | Alta | — (SEO/GEO) | Tarjetas, Anterior/Siguiente y «Blog» son botones: no hay enlaces internos rastreables | verificado |
| G2 | Alta | — (SEO/GEO) | Sin JS el cuerpo de todas las páginas está vacío, sin `noscript` | verificado |
| T2 | Alta | 2.4.3, 4.1.2 | El panel del caso no recibe el foco, no tiene nombre y al cerrar deja el foco en un botón oculto | verificado |
| V1 | Alta | 2.4.7, 1.4.11 | En colores forzados, los campos no tienen límite ni foco visible | verificado |
| V2 | Alta | 1.4.11 | El anillo de foco da 1,1–2:1 sobre Murcia de día | verificado |
| V3 | Alta | 1.4.3 | La pista y el pie, sin placa, bajan de 3:1 sobre la ciudad | verificado |
| V4 | Alta | 1.4.3 | Textos con alfa 0,4–0,46 fallan en la mayoría de las densidades, también sobre vidrio oscuro | verificado |
| D3 | Media | 2.4.3 | «Ir a Murcia» es enfocable durante la intro y no hace nada | verificado |
| D5 | Media | 1.4.2 | La música está activada por defecto y arranca con la primera tecla, Tab incluido | código |
| D6 | Media | 4.1.3 | «Ir a Murcia», Blog y Servicios se tragan la pulsación en silencio mientras Murcia carga | verificado |
| D7 | Media | 2.4.3 | Al volver del blog el foco queda en `body` | verificado |
| T3 | Media | 1.1.1, 1.3.1 | Las gráficas del caso son SVG `aria-hidden` sin alternativa con los datos | verificado |
| T4 | Media | 2.2.2 | Órbitas y pulso del tutorial sin fin, sin control de pausa | código |
| M4 | Media | 1.3.1, 2.4.6 | La placa del campus no tiene rol, nombre ni encabezado | verificado |
| M5 | Media | 4.1.3 | Conócenos no anuncia sus paradas | código |
| M6 | Media | 3.2.2 | Las teclas de un diálogo también actúan sobre la sección de debajo | verificado |
| M7 | Media | 1.1.1, 2.2.2 | El carrusel de la torre rota sin pausa y sin texto | código |
| M8 | Media | 1.3.1, 4.1.3 | «Cargando la ciudad… /models/…glb» queda en el árbol tras cargar | verificado |
| M9 | Media | 2.1.1, 2.5.7 | Explorar la ciudad exige arrastrar | código |
| F3 | Media | 2.1.1, 3.2.2 | Escape para cerrar un desplegable cierra la auditoría entera | verificado |
| F4 | Media | 2.4.3 | Escape no respeta el orden de capas (legal sobre contacto y auditoría) | verificado |
| F5 | Media | 4.1.3, 2.4.3 | Al enviar, el foco cae a `body`; el éxito del contacto no se enfoca | verificado |
| F6 | Media | 2.4.3 | La trampa del panel de cookies se escapa por un `<details>` cerrado | verificado |
| F7 | Media | 1.3.1, 2.4.6 | Los textos legales no tienen encabezados | verificado |
| F8 | Media | 1.4.3 | Placeholders, select vacío y letra pequeña de los formularios por debajo de 4,5:1 | verificado |
| F9 | Media | 1.4.11 | La línea de reposo de los campos da 2,6–2,7:1 | verificado |
| F10 | Media | 3.3.1 | El honeypot `empresa` puede rellenarlo el autocompletado y descartar el envío | sin verificar |
| B3 | Media | 2.4.11 | En el blog el foco queda bajo la cabecera opaca | verificado |
| B4 | Media | 2.1.1 | El blog no se desplaza con teclado si el foco está fuera de `.blog-root` | verificado |
| B5 | Media | 4.1.3 | El recuento del filtro y «No hay entradas» no se anuncian | verificado |
| B6 | Media | 2.4.3 | Al volver al índice el foco va al `h1` y no a la tarjeta de origen | verificado |
| B7 | Media | 1.4.3 | La letra pequeña gris del blog da 4,32:1 | verificado (Lighthouse) |
| B8 | Media | 1.3.1 | Las entradas no tienen `<main>` | verificado |
| V5 | Media | — | El cursor propio anula el puntero grande o de alto contraste del sistema | verificado |
| V6–V8 | Media | 1.4.3, 1.4.11 | Hover del CTA azul, azul como texto sobre vidrio claro, burger y logo sobre Murcia | verificado |
| V9 | Media | 2.4.7 | La opción enfocada del desplegable no se distingue | verificado |
| V10 | Media | 2.2.2 | No hay control para pausar las animaciones | código |
| V11–V14 | Baja | varios | Sonido sobre la cortina en móvil, colores de marca del CMS, panel del caso sin movimiento reducido, px | verificado / código |
| D8 | Baja | 4.1.3 | El cambio de mundo no se anuncia | verificado |
| D9 | Baja | 2.4.3, 4.1.2 | Menú móvil: «Sonido» va antes que los elementos revelados y el nombre cambia con el estado | verificado |
| T5 | Baja | 2.5.1 | En táctil, «Ir a Murcia» solo es visible con foco de teclado | código |
| T6 | Baja | 2.3.3 (AAA) | El vuelo al satélite no tiene versión reducida | código |
| M10 | Baja | 2.4.11 | El logo tapa en parte «Servicios: explorar» al recibir el foco | verificado |
| M11 | Baja | 3.2.4 | «volver» y «salir de los servicios» son la misma salida; las flechas, duplicadas | verificado |
| M12 | Baja | 1.4.13 | Las etiquetas de los puntos de interés no se pueden descartar | código |
| F11–F16 | Baja | varios | Obligatoriedad no indicada, errores al salir de un campo, banner, interruptores, 429… | verificado / código |
| B9–B15 | Baja | varios | «Ir atrás» que no va atrás, alt = pie, `h2` que repite el `h1`, `figure` en `button`… | verificado / código |
| G3 | Baja | — (SEO) | Slug desconocido: 200 sin `noindex` (soft 404) | verificado |

---

## 4. Detalle por área

Cada hallazgo indica la evidencia, el escenario que falla y la dirección del arreglo, sin implementarlo.

### 4.1 Documento y elementos globales

**D1 · Alta · 1.1.1, 4.1.3. Sin WebGL, o con un error fatal, el sitio queda vacío.**
- **Código:**
  - `LazyScene.tsx` marca el fallo como fatal y no renderiza nada.
  - `SceneErrorBoundary.tsx` devuelve `null`.
  - Cabecera, Contacto y Auditoría dependen de `phase === 'site'` (`App.tsx`), y esa fase no llega.
- **Verificado** con `--disable-webgl`: el árbol de accesibilidad entero es un `banner` vacío más `button "Ir a Murcia"`, que no hace nada. En pantalla solo queda «No se pudo cargar la experiencia».
- **A quién afecta:** equipos corporativos con la GPU bloqueada (el público objetivo son directivos de empresas grandes), máquinas virtuales y navegadores antiguos. No hay vía para contactar, pedir la auditoría ni llegar al blog.
- **Arreglo:** un modo 2D cuando haya fatal o falte WebGL: texto de presentación, casos como lista y enlaces a Contacto, Auditoría y `/blog`, anunciado y con el foco puesto en él.

**D2 · Alta · 4.1.3. El rótulo de carga está dentro de un `aria-hidden`.**
- **Código:** `src/intro-draw/introDraw.ts` pone `aria-hidden="true"` en `.intro-root` y después añade dentro el `caption` con `role="status"`. El comentario junto al `caption` dice «Not aria-hidden like the root», pero un `aria-hidden` en un ancestro no se puede anular.
- **Verificado:** el `ariaSnapshot` durante la intro no contiene el rótulo, y `caption.closest('[aria-hidden]')` es `.intro-root`.
- **Escenario:** con NVDA o VoiceOver la intro dura decenas de segundos en silencio. Tampoco se oyen «Esto está tardando más de lo habitual» ni el error. No hay `aria-busy` en ningún sitio.
- **Arreglo:** poner el rótulo como hermano de `.intro-root`, o el `aria-hidden` solo en el canvas o SVG de la marca.

**D3 · Media · 2.4.3. Durante la intro hay un control enfocable.**
- **Contradicción con la decisión:** `docs/decisiones/intro/nada-interactivo-hasta-site.md` dice que nada debe poder recibir el foco antes de `site`, pero `<NavigationControl>` se monta siempre.
- **Verificado:** el primer Tab durante la intro cae en «Ir a Murcia», y activarlo no hace nada (`createNavigationInput.ts`: `if (!context.canNavigate) return false`).
- **Arreglo:** `inert` en el control (y en la cabecera vacía) hasta `site`.

**D4 · Alta · 1.1.1, 1.3.1, 2.4.6. La escena no tiene estructura ni alternativa textual.**
- **Código:** no hay `<h1>` ni `<main>` en `App.tsx`, y el `<Canvas>` de `SceneCanvas.tsx` no tiene rol ni nombre.
- **Verificado en `site`:**
  - Encabezados expuestos: ninguno; los dos `h2` del DOM están ocultos.
  - Landmarks: `header`, `footer`, la región «Cookies» y el `aside` del caso, oculto.
  - axe marca `region` en el canvas.
- **Escenario:** un lector de pantalla no sabe qué es Vertigo, qué ofrece ni que hay casos, una ciudad o servicios. Lighthouse da 100 de todos modos, porque no hay nada que medir.
- **Arreglo:** un `main` con un `h1` (puede ser solo para lectores) y un párrafo de presentación. El canvas, como `role="img"` con `aria-label`, o `aria-hidden` si las alternativas de T1 y M1 cubren su contenido.

**D5 · Media · 1.4.2. La música arranca con la primera tecla.**
- **Código:** `audioOutput.ts` dice «On by default», y `UNLOCK_EVENTS` incluye `keydown`.
- **Escenario:** un usuario de NVDA pulsa Tab para orientarse y empieza la música encima de la voz. «Sonido» es la quinta parada en escritorio.
- **Cumplimiento:** formalmente se cumple 1.4.2, porque el control existe y el audio no arranca sin gesto, pero en la práctica pisa al lector.
- **Arreglo:** no desbloquear con teclas de navegación (Tab, flechas, teclas del lector), o poner «Sonido» primero en el orden. Valorar que el sonido empiece apagado.
- **Sin verificar:** si el audio llega a sonar en headless.

**D6 · Media · 4.1.3. Pulsaciones tragadas mientras Murcia carga.**
- **Código:** `createNavigationInput.ts` y `useSceneShortcuts.ts` devuelven `false` sin dejar nada pendiente ni avisar. Lo mismo hace `createServicesCampus.ts` al entrar en el campus.
- **Verificado:**
  - el estado `.nav[data-state]` es `suppressed` durante unos 9–17 s tras `site` en SwiftShader;
  - un Enter en «Ir a Murcia» durante ese tiempo no hizo nada, sin aviso;
  - un Enter en «Blog» siguió sin efecto a los 120 s.

  En hardware real la ventana es más corta, pero existe.
- **Arreglo:** `aria-disabled="true"` con el motivo mientras `suppressed`, o encolar la petición, o anunciar «Cargando Murcia…».

**D7 · Media · 2.4.3. Al volver del blog el foco se pierde.**
- **Verificado:** tras `goBack()` desde el blog en caliente, `activeElement` es `BODY`. `App.tsx` libera la escena sin mover el foco. La entrada sí está bien: el foco va al `h1` del blog.
- **Arreglo:** devolver el foco al disparador «Blog», o a la pantalla del blog si se entró por ella.

**D8 · Baja · 4.1.3. El cambio de mundo no se anuncia.**
- **Verificado:** tras el warp por teclado, lo único que cambia es el nombre del botón enfocado, que pasa de «Ir a Murcia» a «Volver a la Tierra». Sin verificar con un lector real si eso se anuncia.
- **Arreglo:** una región `polite` con «Estás en Murcia» o «De vuelta en la Tierra».

**D9 · Baja · 2.4.3, 4.1.2. Menú móvil.**
- **Verificado a 390×844:**
  - Con el menú abierto, Tab desde el burger va a «Sonido» antes que a los elementos revelados.
  - El menú no es modal: Tab llega a «Ir a Murcia», que está rechazado mientras el menú sigue abierto.
  - El burger cambia de nombre («Menú» / «Cerrar el menú») además de `aria-expanded`, un doble estado que `SoundToggle.tsx` evita a propósito.
- **Bien:** Escape cierra el menú y devuelve el foco, y `aria-controls` es correcto.

### 4.2 Tierra

**T1 · Crítica · 2.1.1, 1.1.1, 4.1.2. Los casos de éxito solo existen para el puntero.**
- **Código:** `createSatelliteFocus.ts` solo llama a `select()` desde `onClick` con `pickAt(clientX, clientY)`. Las únicas teclas que escucha son de Escape.
- **Decisión documentada:** `picking-por-coordenadas.md` dice «Acceso por teclado a los satélites: no existe ni se ha planteado; es una decisión tomada, no deuda». `docs/trampas/interfaz.md` n.º 50 lo repite.
- **Verificado:**
  - el ciclo de Tab en la Tierra es Blog, Servicios, Contacto, Auditoría, Sonido, cookies, «Ir a Murcia», sin ningún caso;
  - el `ariaSnapshot` no contiene ninguna marca;
  - ninguna tecla (flechas, Enter, Espacio, +/−, AvPág) selecciona un satélite;
  - el panel solo se abrió con clics en una rejilla de coordenadas.
- **A quién afecta:**
  - teclado y switch;
  - lectores de pantalla, también VoiceOver y TalkBack en táctil, cuyo doble toque activa el centro del elemento y no un satélite;
  - cualquiera con temblor, porque los objetivos se mueven.

  Es el contenido que la meta descripción y el producto presentan como prueba («Marketing que se mide»).
- **Arreglo:** una lista DOM de casos (botones con el nombre de la marca) que llame al mismo `select(id)`, en el patrón de `districtA11y.ts`. Hace falta revisar la decisión: es del dueño.

**T2 · Alta · 2.4.3, 4.1.2. El panel del caso.**
- **Código:** `CasePanel.tsx` es `<aside role="complementary">` sin `aria-labelledby`, y no hay ningún `.focus()` al abrir. `handleClosePanel` en `App.tsx` tampoco restaura el foco.
- **Verificado:**
  - al abrir con el ratón, el foco sigue en `body` y no se anuncia nada;
  - al cerrar con Enter en ✕, el foco se queda en ese botón, ya `visibility:hidden` con `tabIndex=-1`.
- **Arreglo:** nombrar el landmark con su `h2`, mover el foco al título al abrir y devolverlo al control de origen (el de T1) al cerrar.

**T3 · Media · 1.1.1, 1.3.1. Gráficas sin datos accesibles.**
- **Código y verificación:** `CaseChart.tsx` dibuja línea, área y barras en un SVG `aria-hidden`; las etiquetas de las barras están dentro. El lector oye «figure Crecimiento» y nada más (verificado). El donut sí expone su leyenda.
- **Arreglo:** una frase con la tendencia (inicio, fin, variación) o una tabla solo para lectores con `labels` y `values`.

**T4 · Media · 2.2.2. Movimiento sin pausa.**
- **Código:**
  - la Tierra gira (`EarthScene.tsx`) y los satélites orbitan sin fin;
  - el satélite que invita pulsa cada 3 s hasta que se selecciona alguno (`orbitConfig.ts`, `hoverTutorial.ts`), y eso no pasa nunca para quien no puede seleccionar (T1);
  - con movimiento reducido las órbitas y el pulso siguen, a propósito (`salto-y-visita-que-vuelve.md` §7).
- **Matiz:** es discutible que la órbita sea esencial; el pulso infinito no lo es.
- **Arreglo:** que el movimiento reducido congele órbitas y tutorial, o un control de pausa de la escena; como mínimo, retirar el pulso tras unas rondas.

**T5 · Baja · 2.5.1.** En táctil el paso a Murcia es un pellizco, y su alternativa de un puntero (`.nav-control`) mide 1 px salvo con `:focus-visible`. «Blog» y «Servicios» llevan a Murcia de un toque, así que 2.5.1 se cumple. Aun así, falta un «Ir a Murcia» visible simétrico a `.scene-home`.

**T6 · Baja · 2.3.3 (AAA).** El vuelo de la cámara al primer plano del satélite (`createFocusCameraRig.ts`) no tiene versión con movimiento reducido. El holograma sí la tiene.

**2.3.1 (tres destellos): pasa.**
- El destello del warp es una cubierta negra con forma `narrowPeak`: sube de 0 a 1 y baja en unos 0,54 s, uno por warp.
- El bloqueo entre warps (duración más enfriamiento) impide más de uno cada ~2 s.
- Medido: un solo pico de opacidad por viaje.
- El de la intro (`swapFlashStrength`) es más débil.

### 4.3 Murcia

**M1 · Alta · 2.1.1. Conócenos no tiene entrada accesible.**
- **Código:**
  - `pointsOfInterest/poiMarkers.ts` marca los puntos `aria-hidden`, con un comentario que dice que se llega «por los atajos de la cabecera»; para Conócenos es falso.
  - `SceneShortcuts.tsx` solo tiene Blog y Servicios.
  - `about/aboutInteraction.ts` dice «The way IN is not here».
  - La entrada solo llega desde el toque en el punto de interés.
  - `seccion-conocenos.md` descartó el atajo de cabecera.
- **Verificado:** en la vista general, el orden de Tab solo ofrece «Servicios: explorar» como control de la ciudad.
- **Arreglo:** un botón «Conócenos: explorar» en el grupo de `DistrictA11y`, que llame a `about.enter()`.

**M2 · Alta · 1.1.1, 1.3.1. Las frases de la pantalla LED solo existen en WebGL.**
- **Código:** `layoutAboutSentences.ts`. En la primera parada, `createAboutSection.ts` no escribe copia en el DOM.
- **Verificado:** el `ariaSnapshot` de `.about-paging` es solo «Parada siguiente», y el `innerText` de `.murcia-ui` no contiene ninguna frase.
- **Arreglo:** escribir `content.sentences` como texto DOM (puede ser visualmente oculto) y anunciarlas al llegar a la parada.

**M3 · Alta · 2.4.3. Cada paso tira el foco a `body`.**
- **Código:** `districtA11y.ts` oculta el botón que tiene el foco; `campusOverlay.ts` y `aboutScreenPaging.ts` deshabilitan sus botones y los ponen `visibility:hidden` en cada transición, y nadie llama a `focus()`.
- **Verificado** en los dos barridos: `activeElement` pasa a `BODY` justo después de Enter en:
  - «Servicios: explorar»;
  - «Servicio siguiente»;
  - «Parada siguiente»;
  - «volver».

  Tras cada «siguiente» hay que tabular de nuevo desde la cabecera.
- **Arreglo:**
  - al entrar, foco al título de la placa (`tabindex=-1`);
  - durante el fundido, `aria-disabled` en vez de ocultar el control enfocado;
  - al salir, foco de vuelta al control de entrada.

**M4 · Media · 1.3.1, 2.4.6.**
- **Verificado:** la placa del campus (`campusOverlay.ts`) es un `div` sin rol ni nombre, con el título también en `div`, y el árbol la lee como un único bloque de texto.
- **Código:** en móvil, `.campus-overlay__body` es `tabIndex=0` sin nombre (`campusSheet.ts`).
- **Arreglo:** título en `h2` y capa como `role="region"` con `aria-labelledby`.

**M5 · Media · 4.1.3.** Conócenos no tiene región viva. Servicios sí la tiene, y anuncia, por ejemplo, «Servicios · 01 / 05. GEO. Hacemos que tu empresa…» (verificado). Arreglo: reutilizar la de `DistrictA11y`.

**M6 · Media · 3.2.2. Las teclas atraviesan los diálogos.**
- **Código:** los listeners de campus y Conócenos están en `window` y siguen activos con un diálogo abierto, y el Escape de los diálogos no detiene la propagación.
- **Verificado:** con el campus abierto, abrir Contacto y pulsar Escape cierra el diálogo y además saca del campus.
- **Sin verificar:** que ←/→ dentro del diálogo paginen la sección de detrás.
- **Arreglo:** apagar la entrada de las secciones mientras haya un diálogo, o `stopPropagation` en la capa superior. Ver F4.

**M7 · Media · 1.1.1, 2.2.2.** El carrusel de la torre (`towerScreen/carousel.ts`) lleva titular, líneas y cifras del CMS (`src/content/types.ts`), rota sin pausa y no tiene texto DOM. Con movimiento reducido solo se salta la entrada. Hay que decidir si es contenido (texto y pausa) o decorado (documentarlo).

**M8 · Media · 1.3.1, 4.1.3.**
- **Verificado:** con la ciudad cargada, el árbol contiene «Cargando la ciudad… /models/murcia-v5.2-lightmaps-r5.glb», y axe marca `#status-overlay` en `region`.
- **Código:** `ui/overlays.ts` lo oculta solo con `opacity: 0` (`.hidden` en `murcia.css`), y no tiene `role="status"` ni `alert` en error.
- **Arreglo:** `hidden` al terminar, `role="status"` durante la carga, `alert` en el error, y sin la ruta del fichero.

**M9 · Media · 2.1.1, 2.5.7.** La cámara de Murcia solo responde al arrastre (`createCameraInput.ts` no escucha `keydown`). Se mitiga porque Blog y Servicios tienen botón; con M1 resuelto bajaría a Baja.

**M10 · Baja · 2.4.11.** «Servicios: explorar» aparece al enfocarse en (16,16), con z-index 16, y `.scene-home` (z 70) tapa parte de la etiqueta; verificado con `elementFromPoint`. Arreglo: colocarlo bajo la línea de la cabecera.

**M11 · Baja · 3.2.4.** La misma salida se llama «volver» y «salir de los servicios», y «Servicio anterior/siguiente» sale dos veces en el orden de Tab (`DistrictA11y` y la placa). Verificado.

**M12 · Baja · 1.4.13.** Las etiquetas de los puntos de interés aparecen con hover, no se cierran con Escape y no se pueden sobrevolar (`pointer-events: none`). Llevan `aria-hidden`, y eso está bien.

### 4.4 Formularios, diálogos, consentimiento y textos legales

**F1 · Alta · 2.4.3, 4.1.2. Contacto no atrapa el foco.**
- **Código:** `ContactSection.tsx` declara `role="dialog" aria-modal="true"`, pero no tiene trampa de foco ni `inert` en el fondo.
- **Verificado:** tras el teléfono, Tab sale a las cookies, a «Ir a Murcia» y a la cabecera, y Shift+Tab desde «Cerrar» va a «Sonido».
- **Escenario:** el lector oculta el fondo al cursor virtual por `aria-modal`, pero Tab lo alcanza: el usuario acaba en controles que su lector dice que no existen.
- **Arreglo:** reutilizar la trampa de `LegalPanel` o `<dialog>` con `showModal()`.

**F2 · Alta · 2.4.11, 2.4.3. La cortina de auditoría.**
- **Código:** `AuditSection.tsx` la monta como `<section aria-labelledby>`, es decir, como región y no como diálogo, y no tiene trampa.
- **Verificado en escritorio:** tras «Aviso legal», Tab entra en los botones del banner de cookies, que quedan debajo de la cortina (`elementFromPoint` da `.audit-form`).
- **Verificado en móvil:** la cortina ocupa toda la pantalla y el foco recorre cuatro controles invisibles.
- **Arreglo:** en móvil (o siempre) tratarla como diálogo. En escritorio, como mínimo, `inert` en lo que tapa.

**F3 · Media · 2.1.1, 3.2.2. Escape en el desplegable cierra la auditoría.**
- **Código:** con `appearance: base-select` (`auditSection.css`) la lista vive en la capa superior, y el Escape que la cierra sube hasta el listener de `window` (`AuditSection.tsx`).
- **Verificado:** abrir «Servicio de interés» con ↓ y pulsar Escape cierra la cortina entera. Los valores se conservan.
- **Arreglo:** ignorar el Escape si viene de un `select` abierto o si `defaultPrevented`, o escuchar en el panel.

**F4 · Media · 2.4.3. Escape no respeta el orden de capas.**
- **Código:** cada superficie registra su Escape en `window`.
- **Verificado:**
  - Contacto → «términos y privacidad» → Escape cierra el contacto (debajo) y deja el panel legal abierto encima, con el foco en «Contacto», detrás del modal;
  - desde la auditoría, cierra las dos capas a la vez.
- **Arreglo:** una pila de capas en la que solo atiende la superior. Junto con M6, es el mismo defecto.

**F5 · Media · 4.1.3, 2.4.3. El envío pierde el foco.**
- **Código:** los dos formularios ponen `disabled` en el botón enfocado al enviar.
- **Verificado:**
  - el foco pasa a `BODY` durante «Enviando…» y sigue ahí tras un 422 o un 502;
  - tras el éxito del contacto, el foco queda en `BODY`, porque el efecto de foco solo corre al abrir;
  - el `role="status"` del éxito se inserta junto con su contenido, lo que no se anuncia de forma fiable;
  - «Enviando…» no está en ninguna región viva.

  La auditoría sí enfoca su título de éxito.
- **Arreglo:** `aria-disabled` en vez de `disabled`, una región viva permanente y enfocar el título del éxito en contacto.

**F6 · Media · 2.4.3.**
- **Código:** la trampa de `LegalPanel.tsx` cuenta como visibles los enlaces de un `<details>` cerrado.
- **Verificado:** desde «Configurar cookies», el Tab sale al banner de detrás. En «términos» la trampa sí da la vuelta.

**F7 · Media · 1.3.1, 2.4.6.**
- **Verificado:** los textos legales son 180 párrafos y ningún encabezado; las secciones («1. Datos identificativos») son párrafos en negrita. Unos 7000 px de texto sin navegación por encabezados. Se contó sobre la salida generada (`src/content/generated/legalDocs.ts`, ignorada por Git y que no se edita a mano).
- **Arreglo:** `LegalBlock` ya mapea los encabezados; falta marcarlos en el contenido de origen: los documentos `legal-terms`, `legal-notice` y `legal-cookies` de Sanity (y sus fixtures en `content/fixtures/legalDoc.json`), que proyecta `content/collections/legalDocs.collection.ts`.

**F8 · Media · 1.4.3.** Medido sobre `--glass-bg-heavy` con el peor fondo de Murcia:

| Texto | Contraste |
|---|---|
| Placeholders | 2,8–2,9:1 |
| Valor del select vacío («Selecciona una opción») | 2,8:1 |
| Letra pequeña al 40 % («Al enviar aceptas…», enlaces legales) | 3,6–3,8:1 |
| «(opcional)» | 4,28:1 |

Un placeholder no está obligado a 4,5:1 si hay etiqueta, pero el valor del select vacío y los enlaces sí lo están.

**F9 · Media · 1.4.11.** `--field-line` (`siteHeader.css`) da 2,6–2,7:1, y es la única marca del área del campo. La línea de foco y `--focus-ring` cumplen. `campos-como-lineas.md` ya prevé subirla.

**F10 · Media · 3.3.1 (sin verificar).** El honeypot se llama `empresa`, con la etiqueta «Empresa». Ya lleva `autoComplete="off"`, `tabIndex={-1}` y está dentro de un contenedor `aria-hidden` (`ContactSection.tsx`), pero Chrome suele ignorar `autocomplete="off"` al autocompletar direcciones y datos de organización. Si rellena «organization», el servidor respondería con un éxito falso y descartaría el mensaje (`docs/trampas/formularios-y-privacidad.md`). No se pudo probar en headless. Arreglo: un nombre que no case con las heurísticas de autocompletado, y una prueba manual con un perfil que tenga empresa.

**F11–F16 · Baja.**
- **F11 · 3.3.2:** ningún campo lleva `aria-required` ni hay instrucción de obligatoriedad. La auditoría solo marca «(opcional)».
- **F12 · 4.1.3:**
  - el error que aparece al salir de un campo no se anuncia;
  - un 422 no enfoca el campo rechazado, aunque `aria-invalid` y `aria-describedby` son correctos.
- **F13 · 2.4.3:**
  - el banner de cookies está casi al final del orden;
  - tras «Rechazar todas» o «Aceptar todas», el foco cae a `body` porque el botón se desmonta.
- **F14 · 1.3.1:** en `CookiePreferences.tsx`, `aria-label={title}` tapa la descripción del interruptor.
- **F15 · 3.3.3:** un envío en menos de 3 s (`server/rateLimit.ts`) recibe «Has enviado varias solicitudes seguidas», que es falso para quien envió una vez.
- **F16 · varios:**
  - el enlace se llama «·Aviso legal» por el `::before`;
  - al abrir la auditoría, el foco pasa 1,1 s en `body`;
  - el contador del mensaje es `aria-hidden`;
  - «Agenda una videollamada» abre otra pestaña sin avisar;
  - `.consent-info` mide 18×18 en escritorio (probablemente cumple 2.5.8 por la excepción de espaciado).

### 4.5 Blog y 404

**B1 · Alta · 2.4.2.**
- **Código:** no hay ningún `document.title` en `src/`.
- **Verificado:**
  - en frío, de `/blog` a una entrada el título sigue siendo «Blog — Vertigo»;
  - entrar a una entrada y volver deja el índice con el título de la entrada;
  - en caliente, todo el blog lleva «Vértigo Marketing® - Web oficial».

  Afecta a lectores, a pestañas y marcadores, y probablemente al `page_title` de la analítica.
- **Arreglo:** fijar el título por ruta con el formato de `postHead` y restaurarlo al salir.

**B2 · Alta · 2.4.3.**
- **Código:** `Article` en `BlogRoute.tsx` reutiliza el mismo `.blog-root` entre entradas, y el foco usa `preventScroll`.
- **Verificado:** desde Anterior/Siguiente o «Más de…», la entrada nueva abre con `scrollTop` 8308, en las preguntas frecuentes, con el foco en un `h1` fuera de pantalla.
- **Arreglo:** `key={post.id}` o `scrollTop = 0` al cambiar de slug.

**B3 · Media · 2.4.11.**
- **Verificado:** `.blog-root` pasa por debajo de la cabecera opaca y no hay `scroll-padding-top`. Con Shift+Tab, un enlace del cuerpo recibe el foco entero bajo la cabecera.
- **Arreglo:** `scroll-padding-top` igual a la altura de la cabecera.

**B4 · Media · 2.1.1.**
- **Verificado:** el scroll vive en `.blog-root` y no en el documento. Con el foco en la cabecera o en `body`, AvPág, Espacio y las flechas no desplazan.
- **Arreglo:** que el documento sea el scroller, o reenviar esas teclas.

**B5 · Media · 4.1.3.** `blog-latest__count` y `.blog-empty` cambian al filtrar o buscar, pero no hay región viva (verificado). Arreglo: `role="status"`.

**B6 · Media · 2.4.3.** Al volver al índice se restaura el scroll, pero el foco va al `h1`, fuera de pantalla, y el siguiente Tab salta arriba del todo (verificado). Arreglo: enfocar la tarjeta de la entrada de origen.

**B7 · Media · 1.4.3.** `rgba(11,11,13,.55)` sobre `#fbfbfa` da **4,32:1** en texto de 10,9–12,5 px (verificado con Lighthouse y axe). Afecta a:
- `.blog-eyebrow`;
- `.blog-meta`;
- `.blog-card__eyebrow`;
- `.blog-prevnext__label`;
- `.blog-footer`;
- `.blog-latest__count`.

Arreglo: opacidad 0,6 o más (unos 4,9:1).

**B8 · Media · 1.3.1.** Las entradas no tienen `<main>`: sus landmarks son `header`, Cookies, `article`, `nav` y `footer` (verificado). El índice sí lo tiene.

**B9–B15 · Baja.**
- **B9 · 2.4.4, 3.2.4:** «Ir atrás» lleva a `/` en el índice frío y en el 404. Quien llega desde Google no vuelve a Google.
- **B10 · 1.1.1:** dos portadas tienen alt igual al pie (se oye dos veces). El esquema de Sanity exige alt (`sanity-studio/schemas/objects/media.ts`), pero no impide que coincida con el pie.
- **B11 · 1.3.1, contenido:** tres entradas abren el cuerpo con un `h2` que repite el `h1`. No hay niveles saltados; el mapeo de `PostBody.tsx` es correcto.
- **B12 · 4.1.2:** `<figure>` dentro del `<button>` de la tarjeta, con un nombre accesible larguísimo; en la destacada el título se oye dos veces.
- **B13:** `MediaCard.tsx` usa `target="_blank"` sin aviso y un nombre genérico; hoy no lo usa ningún contenido.
- **B14 · 1.3.1:** los filtros son conmutadores dentro de un `<nav>`; mejor `role="group"`.
- **B15:** la marca 3D del blog es correcta: `aria-hidden`, sin foco y quieta con movimiento reducido. Se anota como referencia.

**404:**
- tiene `main`, un `h1` único, un enlace real a `/`, `noindex` y contraste suficiente (verificado);
- Lighthouse da SEO 54, pero es lo esperado en un 404 con `noindex` (sin meta descripción e `is-crawlable`);
- `font-size` sale marcado por la letra pequeña.

### 4.6 Capa visual: contraste sobre la escena, foco, texto y movimiento

**Método de contraste.** El alfa del texto se compone sobre el alfa del vidrio, con cuatro fondos detrás:
- negro;
- el cielo de Murcia, rgb(168,182,199), el valor que ya usa `siteHeader.css`;
- un tejado claro, rgb(235,232,225);
- blanco.

El desenfoque no cambia la luminancia media, así que la cifra vale con `backdrop-filter` y sin él. Se completa con un muestreo de píxeles reales en capturas de la Tierra y de Murcia en reposo (1280×800 y 360×740). F8, F9 y B7 son parte de esta misma medición y no se repiten aquí.

**V1 · Alta · 2.4.7, 1.4.11. En colores forzados, los campos de los formularios no tienen límite ni foco.**
- **Código:**
  - El campo se dibuja solo con dos `linear-gradient` de fondo y `border: 0` (`auditSection.css`, `contactSection.css`).
  - El foco quita el `outline` (`.audit-input:focus`, `.contact-input:focus`, `outline: none`).
  - Colores forzados elimina los degradados. No hay ninguna regla `forced-colors` ni `prefers-contrast` en todo `src/`.
- **Verificado** (emulación de colores forzados, claro y oscuro), en los dos formularios de captación:
  - el estilo computado queda en `backgroundImage: none`, borde `none` y `outline: none`;
  - los campos no tienen límite visible y el enfocado no tiene indicador;
  - el error pierde la línea roja y solo queda el texto.
- **Arreglo:** en `:focus-visible`, `outline: 2px solid transparent` en lugar de `none` (colores forzados lo convierte en un contorno visible). Además, un bloque `@media (forced-colors: active)` con `border-bottom: 1px solid CanvasText`.

**V2 · Alta · 1.4.11. El anillo de foco se pierde sobre Murcia de día.**
- **Código:** `--focus-ring` (`siteHeader.css`), azul claro al 90 %, con separación de 2–4 px, así que se dibuja sobre la escena y no sobre el vidrio.
- **Calculado:**
  - 1,12:1 contra el cielo;
  - 1,79:1 contra un tejado claro;
  - 2,05:1 contra la cara azul de «Auditoría».
- **Muestreado:** alrededor del logo en Murcia, 1,06–1,97:1. Sobre vidrio oscuro cumple (5,1–7,3:1).
- **Arreglo:** un anillo de dos tonos (contorno claro y `box-shadow` oscuro de 2 px) que llegue a 3:1 sobre cualquier fondo.

**V3 · Alta · 1.4.3. Texto sobre el canvas sin placa.**
- **Código:** `.scene-hint` (blanco al 85 %) y `.site-footer[data-tone='light']` (al 80 %) en `styles.css` no tienen fondo, solo una sombra débil.
- **Muestreado en Murcia a 1280 px:**

  | Texto | Mediana | Percentil 75 |
  |---|---:|---:|
  | Pista | 5,0:1 | 2,9:1 |
  | Pie «2026 \| Vértigo Marketing» | 2,68:1 | 1,81:1 |

- **Muestreado en teléfono:** la pista da una mediana de 2,54:1.
- **En la Tierra** los dos pasan, sobre el espacio.
- La pista es la única instrucción visible del gesto de vuelta.
- **Arreglo:** la placa de densidad A que ya lleva la brújula, o un halo que cuente como fondo.

**V4 · Alta · 1.4.3. Tokens de alfa bajo que fallan en la mayoría de las densidades, también sobre vidrio oscuro.**

Son textos de 0,65–0,8 rem, varios en mayúsculas espaciadas:

| Texto | Contraste | Dónde |
|---|---|---|
| `--text-muted` (0,46): antetítulo del caso, «(opcional)», etiqueta de medidas del campus | 3,55–4,65:1 según la densidad | `siteHeader.css`, `styles.css`, `murcia.css` |
| `.case-panel__meta` (0,45) | 3,47–4,49:1 | `styles.css` |
| Título de gráfica (0,45) y marcas de eje de 10 px (0,4) | 3,65–4,48:1 | `styles.css` |
| Enlace del banner de cookies (0,55) y pie del banner (0,62) | 3,66–4,55:1 sobre fondos claros | `consentBanner.css` |

**Arreglo:** subir `--text-muted` a unos 0,6 y poner un suelo de 0,55–0,6 para notas, textos legales y ejes.

**V5 · Media · cursor propio (sin criterio AA directo; impacto real en baja visión).**
- **Código:**
  - `.has-custom-cursor * { cursor: none !important }` (`styles.css`) sustituye el puntero del sistema por una mano SVG fija de 24 px, cuya posición se escribe en un rAF (`CustomCursor.tsx`);
  - anula el puntero grande o invertido del sistema operativo.
- **Verificado:** en colores forzados la mano sigue blanca, y en el tema claro queda blanca sobre paneles gris claro. El anillo sí pasa a `CanvasText`.
- **Sin verificar:** el retraso cuando el hilo principal está ocupado.
- **Arreglo:**
  - no montarlo con `forced-colors: active` ni con `prefers-contrast: more`;
  - ofrecer una forma de desactivarlo;
  - valorar `cursor: url()` nativo.

**V6 · Media · 1.4.3. Estado hover del CTA azul.**
- Blanco sobre `--accent-hover` (#3a7dff) da 3,78:1, y el extremo del barrido, 2,43:1. Es texto de 0,78–0,95 rem, así que no cuenta como texto grande.
- En reposo cumple: #1c67ff da 4,74:1.
- **Arreglo:** un hover más oscuro, no más claro.

**V7 · Media · 1.4.3. Azul como texto sobre vidrio claro.**
- `.campus-overlay__action--primary` usa `--accent-hover` (`murcia.css`).
- Contraste: 5,27:1 sobre negro, pero 3,45:1 sobre el cielo y 2,69:1 sobre blanco. Ese vidrio está sobre la ciudad.

**V8 · Media · 1.4.11. Glifos de control sobre Murcia.**
- El burger blanco de la escena da una mediana de 2,39:1 en teléfono. El propio comentario de `siteHeader.css` admite «under 2:1 in places».
- El logo 3D «Volver a la Tierra» sobre tejados da una mediana de 2,40:1.
- **Arreglo:** la placa que ya tiene `.sound-toggle::before`.

**V9 · Media · 2.4.7, 1.4.11. Opción enfocada del desplegable.**
- **Código:** `.audit-select option:focus-visible` (`auditSection.css`) quita el contorno y pone un fondo al 6 %, que da 1,12:1 frente a la lista.
- **Verificado:** tras dos ↓ no se distingue la opción activa (Chromium headless; conviene confirmarlo a mano).

**V10 · Media · 2.2.2. Movimiento sin control de pausa.** Arrancan solos, duran más de 5 s y no tienen control de pausa:
- la pista flota en bucle de 6 s;
- los puntos de interés pulsan;
- el tutorial pulsa sin fin (T4);
- las órbitas;
- el carrusel de la torre (M7).

`prefers-reduced-motion` está muy bien cableado, pero un evaluador no suele aceptarlo como único mecanismo. **Arreglo:** un conmutador «Pausar animaciones» junto a «Sonido» que pare los bucles del DOM y congele los relojes de la escena.

**V11 · Baja · 2.4.11 (pasa AA, falla 2.4.12 AAA).** En móvil `.sound-toggle` queda fijo abajo a la izquierda, por encima de la cortina de auditoría (z 70 frente a z 60). Al final del scroll tapa en parte un mensaje de error y «Términos y privacidad» (verificado a 320×640).

**V12 · Baja · 1.4.11. Colores de marca del CMS.** `--case-brand` llega de Sanity sin control de contraste: solo se valida el formato. Con un color real del contenido:

| Marca | Contraste frente al fondo |
|---|---:|
| Línea | 2,09:1 |
| Barras | 1,26:1 |
| Relleno | 1,09:1 |

Con T3 sin resolver, la gráfica es inaccesible por los dos lados. **Arreglo:** validar 3:1 en el build de contenido.

**V13 · Baja.**
- **Animaciones del panel del caso:** `case-reveal` y `case-chart-*`, incluido el «ping» a escala 4,5, no tienen bloque de movimiento reducido (`styles.css`). `panel-del-caso.md` lo decide así para la cascada y el conteo, pero el ping no es necesario.
- **Lectura única de la preferencia:** si el visitante cambia el ajuste a mitad de visita, el CSS lo aplica al momento y la escena no (`movimiento-del-documento.md`).

**V14 · Baja.**
- **Tamaños en px** que no siguen el tamaño de letra del navegador; el zoom sí funciona:
  - brújula: `clamp(9px, 2.3vw, 12px)`;
  - etiquetas de los puntos de interés: 13 px;
  - placa del campus en línea: 12–44 px;
  - ejes de las gráficas: 10 px.
- **Verificado:** sin desbordamiento a 640×400 (equivale a 200 %) ni a 320×640.
- **Borde del buscador del blog:** 1,44:1.
- **Sin `prefers-reduced-transparency`:** tres literales de vidrio (banner, hoja del caso en móvil y velo de Contacto) no siguen el `@supports` que vuelve opacas las densidades.

**Bien:**
- el texto principal (blanco al 94 % o más) cumple en las tres densidades incluso sobre blanco (6,2–9,2:1);
- hay un `@supports` sin `backdrop-filter` que vuelve casi opaco el vidrio;
- todos los controles tienen `:focus-visible` con un token único;
- lo que solo existe para teclado (`.nav-control`, `.district-a11y-control`) aparece con placa propia (12,4:1);
- reflow a 320 px y espaciado de texto (1.4.12) sin recortes;
- no hay bloqueo de orientación;
- `font-display: swap`;
- en colores forzados, Chromium da placa al texto sobre el canvas y los anillos pasan a colores del sistema.

### 4.7 Google: buscadores, rastreadores y herramientas

**Lighthouse** (Chromium de Playwright, headless):

| Página | Accesibilidad | SEO | Buenas prácticas | Fallos |
|---|---:|---:|---:|---|
| `/` | 100 | 100 | 100 | — |
| `/blog` | 96 | 100 | 100 | contraste (B7) |
| `/blog/diferencias-seo-y-geo` | 96 | 100 | 100 | contraste (B7) |
| `/404.html` | 100 | 54 | 96 | `noindex`, meta descripción, tamaño de letra (esperado) |

El 100 de `/` es la cifra que más engaña de este informe: Lighthouse analiza un DOM casi vacío y no puede saber que el contenido está en un canvas. Ninguna puntuación automática sustituye al recorrido con teclado del §1.

**G1 · Alta (SEO/GEO).** No hay enlaces internos rastreables:
- las tarjetas del blog, Anterior/Siguiente y «Ver todo el blog» son `<button>` (`BlogRoute.tsx`), y no hay ni un `<a href="/blog/...">` en `src/blog`;
- en la escena, «Blog» también es un botón (`SceneShortcuts.tsx`), y `dist/index.html` no tiene ningún `<a>`.

Las entradas solo se descubren por `sitemap.xml`, que sí las lista. Además, no se pueden abrir en otra pestaña ni copiar su enlace, y no aparecen en la lista de enlaces del lector.

Arreglo: `<a href>` reales que intercepten el clic sin modificadores para hacer la transición.

**G2 · Alta (SEO/GEO).** El `<body>` de todos los documentos construidos es `<div id="root"></div>`, sin `<noscript>`. Afecta a `/`, `/blog`, las entradas y el 404.
- Es intencionado para el cuerpo del blog: `docs/decisiones/blog/cabeceras-prerenderizadas.md` lo deja pendiente.
- Verificado con JS desactivado: `innerText` vacío en todas.
- Googlebot renderiza JS en diferido. Los rastreadores de IA que no ejecutan JS (GPTBot, ClaudeBot, PerplexityBot…) no ven ni una palabra, y para una agencia cuyo argumento principal es GEO es la contradicción más visible.

Arreglo: prerenderizar el cuerpo de las entradas, y un `<noscript>` con presentación y enlaces en `/`.

**G3 · Baja (SEO).** Un slug desconocido devuelve 200 con «Esa entrada no existe», el título del índice y sin `noindex` (soft 404). Es intencionado (`docs/trampas/blog.md` n.º 29), pero se puede añadir el `noindex` en esa rama.

**Bien:**
- cada entrada prerenderizada lleva título, descripción, canónico, `og:*` y JSON-LD `BlogPosting` con `inLanguage`;
- el sitemap tiene `lastmod`;
- `robots.txt` es correcto;
- el 404 lleva `noindex`.

---

## 5. Lo que está bien hecho

- **Idioma y zoom:** `lang="es"` en todos los documentos construidos; el viewport no lleva `user-scalable=no` ni `maximum-scale`, y el pellizco funciona.
- **Alternativa de teclado al gesto:** `.nav-control` es un `button` real con Enter y Espacio, nombrado por su destino («Ir a Murcia» / «Volver a la Tierra»). Está oculto con `clip-path` y se ve al recibir el foco. Verificado de extremo a extremo; ya lo cubre `e2e/navigation.spec.ts`.
- **Servicios accesibles:** `districtA11y.ts` es un `group` con nombre, botones reales y región `polite` `aria-atomic`, y anuncia el número, el título y el cuerpo de cada servicio (verificado).
- **Sin atajos de un solo carácter (2.1.4):** solo se usan Escape, flechas, Enter y Espacio. Las flechas de las secciones se ignoran con modificadores y dentro de campos de texto. F3 solo existe con las herramientas de depuración.
- **Formularios:**
  - todos los campos tienen `<label for>`;
  - `autocomplete` (`name`, `email`, `url`, `tel`) y tipos correctos (1.3.5);
  - texto de 16 px, sin zoom en iOS;
  - errores con texto, `aria-invalid` y `aria-describedby`, y el envío vacío enfoca el primer campo inválido (verificado);
  - fallos con `role="alert"` que conservan lo escrito;
  - `select` nativo: teclado, búsqueda por letras y selector del sistema en móvil (verificado).
- **Panel legal:** `role="dialog"`, `aria-modal`, foco inicial en el título, trampa que da la vuelta, devolución del foco al enlace que lo abrió y desplazamiento con teclado (verificado).
- **Devolución del foco** al cerrar Contacto y Auditoría con Escape, con la ✕ o con clic en el fondo (verificado).
- **Consentimiento:** «Rechazar todas» y «Aceptar todas» tienen el mismo peso y 44 px en móvil. La región tiene nombre y no roba el foco. Los interruptores usan `role="switch"`, y «Cambios sin guardar» y «Preferencias guardadas» se anuncian.
- **Blog:**
  - foco al `h1` en cada ruta;
  - Atrás y Adelante restauran ruta, scroll y foco;
  - Portable Text sin `dangerouslySetInnerHTML`, con listas y `time` reales;
  - enlaces del cuerpo subrayados;
  - anillo de foco de 2 px y dianas de 44 px;
  - sin scroll horizontal a 320 px, ni recortes con texto al 200 % o con el espaciado de 1.4.12 (verificado).
- **Lo decorativo está oculto:** pistas, puntos de interés, brújula, paneles de marca, marca 3D del blog y SVG decorativos llevan `aria-hidden`. Lo oculto usa `visibility: hidden` y sale del orden de Tab.
- **Movimiento reducido** respetado en la intro, el warp (sin vacío ni aumento de FOV), los vuelos del campus (cortes), las partículas (quietas), los fundidos CSS, el menú y el cursor.
- **2.5.1, 2.5.7 y 2.5.8:** cada gesto tiene alternativa. El asa de las hojas es un botón con `aria-expanded`, y la mayoría de dianas miden 44 px o más.
- **Pérdida de contexto WebGL:** se anuncia con `role="alert"`, `h2` y un botón «Recargar».

---

## 6. Decisiones vigentes que chocan con WCAG

Estos hallazgos no son descuidos: contradicen decisiones escritas. Arreglarlos exige que el dueño cambie la decisión, no solo el código.

| Decisión | Qué dice | Hallazgo |
|---|---|---|
| `interfaz/picking-por-coordenadas.md`, `trampas/interfaz.md` n.º 50 | Los satélites no tienen camino de teclado, «no es deuda» | T1 |
| `murcia/seccion-conocenos.md`, «Qué se descartó» | Sin atajo de cabecera a Conócenos; el cielo y el isotipo ignoran el movimiento reducido | M1, M7, T4 |
| `intro/salto-y-visita-que-vuelve.md` §7 | Las órbitas y el giro del logo siguen con movimiento reducido | T4 |
| `transicion/musica.md` y `audioOutput.ts` | La música empieza sola en el primer gesto, también una tecla | D5 |
| `blog/cabeceras-prerenderizadas.md` | Se prerenderiza la cabecera, no el cuerpo | G2 |
| `blog/entrada-por-la-pantalla.md` e `interfaz/atajos-blog-y-servicios.md` | El blog y los servicios son un recorrido, no un enlace | G1 (se puede mantener el vuelo con un `<a>`) |

---

## 7. Orden sugerido

1. **Antes del lanzamiento (Crítica y Alta):**
   - T1 y T2: lista DOM de casos y foco del panel;
   - M1, M2 y M3: entrada a Conócenos, frases en el DOM y foco en las secciones;
   - D1 y D2: modo sin WebGL y rótulo de carga;
   - D4: `main`, `h1` y presentación;
   - F1 y F2: diálogos modales de verdad;
   - B1 y B2: título y scroll del blog.

   Son cambios acotados que siguen patrones que el repo ya tiene: `districtA11y.ts` para las alternativas DOM, la trampa de `LegalPanel` y el foco al `h1` del blog.
2. **Una sola pieza para tres hallazgos:** una pila de capas para Escape y teclado (F3, F4 y M6).
3. **Enlaces y contenido rastreable:** G1 y G2.
4. **Contraste y estados:**
   - V1 primero: es un bloque `forced-colors` pequeño y protege los dos formularios de captación;
   - V2, el anillo de dos tonos, que se cambia en un solo token;
   - V3, V4, F8, F9 y B7: subir alfas y poner placas.
5. **Resto de Media y Baja.**

**Pruebas que faltan.** Ningún test unitario ni e2e cubre la trampa de foco, el orden de Escape, la devolución del foco, el foco tras el éxito del contacto ni el Escape dentro del select. Lo que hay hoy:
- el banner que no roba el foco;
- los errores del servidor;
- el honeypot;
- `.nav-control`.

Un e2e que recorra con Tab cada superficie y compruebe `activeElement` y la contención del foco cubriría la mayoría de estos hallazgos. axe-core no está entre las dependencias; añadirlo como e2e es una decisión aparte, y el §1 muestra por qué no basta por sí solo.

---

## 8. Sin verificar y límites

- Ningún lector de pantalla real. Que NVDA o VoiceOver anuncien el cambio de nombre de `.nav-control` tras el warp (D8), cómo interceptan las flechas en modo exploración y cómo se oye `aria-modal` son deducciones del árbol de accesibilidad.
- Solo Chromium. Safari y Firefox no implementan `appearance: base-select`, así que el select es el nativo de siempre y F3 puede no darse; no está comprobado.
- F10 (honeypot y autocompletado) y D5 (si la música suena realmente con Tab) están sin probar.
- Tamaño de objetivo de los satélites en movimiento y contraste no textual del donut con cada color de marca: sin medir.
- En el contenido del CMS:
  - `auditSuccessTitle` y `auditSuccessBody` parecen invertidos: el `h2` que recibe el foco lee la frase larga;
  - el banner de cookies dice «Google Analytics todavía no está instalado»;
  - los enlaces internos de las entradas apuntan a otro dominio y otros slugs.

  No son de accesibilidad, pero es lo que oye un lector de pantalla.
