# Documentación de vgc

Índice de las decisiones vigentes. Si vas a cambiar algo de un área, lee antes su decisión y su archivo de trampas.

## Reglas de esta documentación

1. **Idioma:** la documentación vigente se escribe en español. El código, los identificadores, los nombres de archivos de código y los mensajes de commit siguen en inglés. Lo archivado se queda en su idioma original.
2. **Una decisión por archivo, siempre en estado actual.** Si una decisión cambia, se reescribe; la versión anterior queda en git o en `archivo/`. No se acumulan enmiendas.
3. **Los números no se copian, se enlazan.** Se cita la constante y su archivo («`CAMERA_DISTANCE` en `murciaConfig.ts`»), no su valor. El porqué de cada cifra vive en el comentario junto a la constante.
4. **Campos de una decisión:** estado, desde cuándo y a qué sustituye; decisión; por qué; qué se descartó; se ha roto si…; afecta a (rutas).
5. **Las trampas** (errores conocidos y comportamientos que parecen bugs pero son intencionados) van en `trampas/`, agrupadas por área.

## Documentación anterior

La migración por áreas terminó el 2026-10-20. La documentación anterior está archivada entera:
- [`archivo/DECISIONS.md`](archivo/DECISIONS.md), [`archivo/ARCHITECTURE.md`](archivo/ARCHITECTURE.md) y [`archivo/adr/`](archivo/adr/). Cada entrada lleva una marca (**Migrada**, **Sustituida**, **Historia** o **Principio genérico**) que dice adónde fue lo vigente.
- [`archivo/PROJECT_MEMORY.md`](archivo/PROJECT_MEMORY.md) y [`archivo/ENGINEERING_PRINCIPLES.md`](archivo/ENGINEERING_PRINCIPLES.md), sin marcas apartado por apartado. El primero llevaba mucho tiempo desfasado: el detalle de lo que se hizo está en los commits y el porqué, en las decisiones. El segundo eran principios genéricos que ya cubren `CLAUDE.md` y las decisiones.

Todo eso es historia, no fuente, y puede contradecir el código. Las citas por nombre que quedan en comentarios de código («DECISIONS §6», «ADR 013», «ARCHITECTURE §17», «PROJECT_MEMORY, …») se refieren a la copia archivada.

| Área | Estado |
|---|---|
| Cámara y navegación de Murcia | migrada |
| Transición / warp | migrada |
| Intro y arranque | migrada |
| Escena de la Tierra | migrada |
| Interfaz y contenido (cabecera y menú, cursor, picking, vidrio, tipografías, datos de casos) | migrada |
| Formularios, consentimiento y legal | migrada |
| Contenido / CMS | migrada |
| Blog | migrada |
| Render y gráficos (ADR 001, 002, 008) | migrada |
| Build y presupuestos | migrada |
| Campus de servicios | migrada |
| Arquitectura y módulos | migrada |

Los documentos sustituidos por completo se mueven a [`archivo/`](archivo/), conservando su ruta relativa (`content/x.md` → `archivo/content/x.md`), y se actualizan los enlaces que apuntan a ellos.

## Decisiones

### Intro y arranque
- [Arranque sin dependencias](decisiones/intro/arranque-sin-dependencias.md): el chunk de arranque no importa nada y tiene presupuesto.
- [Carga real y disponibilidad](decisiones/intro/carga-real-y-disponibilidad.md): progreso visual, progreso medido y disponibilidad son tres cosas.
- [Plazo de carga](decisiones/intro/plazo-de-carga.md): el plazo solo puede fallar; las decoraciones no son fatales.
- [Ritmo del dibujo](decisiones/intro/ritmo-del-dibujo.md): segundos visibles, ritmo uniforme, dibujo en un worker.
- [Máquina de apertura](decisiones/intro/maquina-de-apertura.md): una sola apertura por página y única fuente de la fase; fases ordenadas, tres caminos de entrada, reloj propio sin gsap.
- [Trabajo por fase](decisiones/intro/trabajo-por-fase.md): qué trabajo se admite en cada fase.
- [Warp de la intro](decisiones/intro/warp-de-la-intro.md): dos tramos, corte oculto, cruce por cero del logo.
- [Nada interactivo hasta `site`](decisiones/intro/nada-interactivo-hasta-site.md): y el consentimiento es el último trazo.
- [Salto y visita que vuelve](decisiones/intro/salto-y-visita-que-vuelve.md): saltar la cola, espera silenciosa, movimiento reducido, depuración.

### Escena de la Tierra
- [Cámara de Earth](decisiones/earth/camara-de-earth.md): un escritor por fotograma, rig de foco, desplazamiento de la auditoría.
- [Banda de zoom de Earth](decisiones/earth/banda-de-zoom-de-earth.md): el extremo cercano por encima de los satélites; texturas fijadas.
- [Satélites](decisiones/earth/satelites.md): órbitas, modelo, tamaño, orientación, invitación.
- [Holograma de marca](decisiones/earth/holograma-de-marca.md): isotipo en reposo, logo al seleccionar, una sola luz.
- [Placas de marca](decisiones/earth/placas-de-marca.md): suelo dibujado que los logos reales mejoran.
- [Validación de marcas subidas](decisiones/earth/validacion-de-marcas-subidas.md): Studio en dos niveles y otra vez en el build.
- [Panel del caso](decisiones/earth/panel-del-caso.md): hoja inferior en móvil, acotada por el logo.
- [Cielo](decisiones/earth/cielo.md): fotografía en una malla; las imágenes y la exposición actuales son las buenas.
- [Pista de escena](decisiones/earth/pista-de-escena.md): la misma pista en los dos mundos.
- [Convenciones de render](decisiones/earth/convenciones-de-render.md): texturas horneadas, escala en el montaje, `colorspace_fragment`, KTX2.

### Navegación entre mundos
- [Banda de zoom y commit](decisiones/navegacion/banda-de-zoom-y-commit.md): ambos mundos comparten banda; la rueda hace commit al final, el dedo con un pellizco nuevo desde el final; dos dedos solo son pellizco.

### Transición y warp
- [Ciclo de vida](decisiones/transicion/ciclo-de-vida.md): ambos mundos siempre montados; desactivar es congelar. Earth vuelve a la vista general.
- [Precarga de Murcia](decisiones/transicion/precarga-de-murcia.md): bytes durante la apertura, construcción y precalentado en `site`.
- [Corte bajo destello](decisiones/transicion/corte-bajo-destello.md): nada hace fundido cruzado; el corte cae bajo el pico del destello.
- [Warp](decisiones/transicion/warp.md): un progreso y tres curvas; cada mundo mueve su cámara; salir de Murcia es subir.
- [Giro de Earth hacia España](decisiones/transicion/giro-de-earth-hacia-espana.md): fase fija después del commit.
- [Vacío](decisiones/transicion/vacio.md): pase de pantalla al salir de Murcia, nunca un aumento de FOV.
- [Música](decisiones/transicion/musica.md): la música hace fundido cruzado; la imagen no.
- [Efectos de sonido](decisiones/transicion/efectos-de-sonido.md): un clip por momento, en el grafo de la música; un solo interruptor; lo que llega tarde se descarta.

### Murcia
- [Pose de reposo](decisiones/murcia/pose-de-reposo.md): todos los hitos en plano al aterrizar.
- [Modelo de entrada](decisiones/murcia/modelo-de-entrada.md): un puntero mueve giro y avance; el mundo sigue al dedo; ganancia e inercia propias para el dedo.
- [Sensación de cámara](decisiones/murcia/sensacion-de-camara.md): muelles que aterrizan, zoom críticamente amortiguado, inclinación hacia el cursor.
- [Límites de la cámara](decisiones/murcia/limites-de-camara.md): solo se limita el objetivo, al anillo A2; `check:footprint` es la garantía.
- [Brújula](decisiones/murcia/brujula.md): rumbos en el suelo, blanca, sobre la cabecera, no es un control.
- [Edificios interactivos](decisiones/murcia/edificios-interactivos.md): tinte de hover y tres puntos de interés siempre visibles, con su nombre al llegar y en hover.
- [Cielo de Murcia](decisiones/murcia/cielo-de-murcia.md): una cúpula siempre puesta, de la neblina a la noche con estrellas; no es CSS ni `scene.background`.
- [Sección Conócenos](decisiones/murcia/seccion-conocenos.md): tres paradas desde la torre con la reclamación `'about'`; la primera es la pantalla, que escribe cinco frases, sin placa; la segunda, la ciudad oscurecida con el isotipo dibujado encima; se avanza con la rueda hacia arriba o deslizando, sin flechas en la placa; satélites con paneles de marca; «Ver sus casos» hace el warp desde el cielo; el cielo y el dibujo del isotipo no respetan el movimiento reducido, a propósito.

### Campus de servicios
- [Modelo y recorrido](decisiones/campus/modelo-y-recorrido.md): el campus es la sección de servicios; anillo sin fin, se entra por el lago, los edificios, el atajo o el teclado, y se sale desde cualquier parada.
- [Cámara propia](decisiones/campus/camara-propia.md): el campus vuela su cámara con la reclamación `'campus'` y la devuelve con `adoptFromCamera` a la pose de entrada.
- [Figuras que argumentan](decisiones/campus/figuras-que-argumentan.md): símbolo y figura esquemáticos, elegidos por el editor; sin figura es un hueco; no hay leyenda.
- [Contenido y composición](decisiones/campus/contenido-y-composicion.md): textos, colores, formas y orden vienen de Sanity; el dibujo, el enlace con el GLB y la interfaz son código; el documento entra entero o no entra.
- [Placa y hoja](decisiones/campus/placa-y-hoja.md): placa al lado y acotada en escritorio; hoja de dos paradas en el móvil, con una parada compacta que no achica las partículas; acciones opcionales para Conócenos.
- [Tira LED](decisiones/campus/tira-led.md): el motor de la torre, una frase en código repetida `REPEATS` veces y deslizada, nunca con el paso apretado.
- [Partículas y movimiento reducido](decisiones/campus/particulas-y-movimiento-reducido.md): un campo que sale del lago; con movimiento reducido se queda quieto pero sigue formando cada figura.
- [Aspecto del campus](decisiones/campus/aspecto-del-campus.md): el agua del río en el lago; luz horneada; la paleta solo para una exportación sin hornear.

### Contenido y CMS
- [Generado en build](decisiones/contenido/generado-en-build.md): el navegador nunca llama al CMS; emisión determinista y transaccional.
- [Fallo estricto y fuentes](decisiones/contenido/fallo-estricto-y-fuentes.md): producción nombra su fuente; el seed está en retirada; el sello de versión alimenta «Estado de la web».
- [Sanity y la proyección GROQ](decisiones/contenido/sanity-y-proyeccion-groq.md): una consulta por colección a la API en vivo; la proyección es el contrato.
- [Texto estructurado](decisiones/contenido/texto-estructurado.md): Portable Text tipado; lo desconocido falla, salvo el bloque vacío.
- [Medios replicados](decisiones/contenido/medios-replicados.md): lo que se dibuja se copia al despliegue; el blog se queda en la CDN.
- [Qué decide el editor](decisiones/contenido/que-decide-el-editor.md): todo lo que pasa por Sanity, también lo visual; nunca código.
- [Límites editoriales](decisiones/contenido/limites-editoriales.md): cada límite se escribe una vez; el Studio avisa antes y el build garantiza.
- [Pantalla de la torre](decisiones/contenido/pantalla-de-la-torre.md): singleton con plantilla de huecos y límites medidos.
- [Vista previa del Studio](decisiones/contenido/vista-previa-del-studio.md): reutiliza los componentes y el CSS del sitio; obliga a redesplegar el Studio; check pendiente.

### Formularios
- [Backend de los formularios](decisiones/formularios/backend-de-formularios.md): dos funciones del mismo origen; éxito solo si se entrega; sin clave en producción, error.
- [Diálogo de contacto, teléfonos y ©](decisiones/formularios/dialogo-de-contacto.md): el pie lleva solo el ©; teléfonos y reserva en el diálogo; enlaces legales en la auditoría.
- [Rangos del formulario de auditoría](decisiones/formularios/rangos-del-formulario-de-auditoria.md): facturación y presupuesto son listas de Sanity; la etiqueta es el valor; el servidor exige el conjunto cerrado.

### Privacidad
- [Consentimiento](decisiones/privacidad/consentimiento.md): un registro versionado en `localStorage`, dos categorías, borradores en el panel, botón de información tras elegir.
- [Analítica](decisiones/privacidad/analitica.md): Vercel y GA4 a petición del cliente, solo en producción y tras consentir; retirada completa.
- [Textos legales](decisiones/privacidad/textos-legales.md): paneles, tres documentos fijos en código, fuera del JS inicial; casilla de consentimiento pendiente.
- [Cabeceras de seguridad y CSP](decisiones/privacidad/cabeceras-y-csp.md): CSP aplicada, su porqué en `vercelConfig.test.ts`, `'unsafe-eval'` solo por KTX2, escaneo de secretos.

### Blog
- [El blog es un segundo documento](decisiones/blog/segundo-documento.md): `/blog` tiene su propio HTML, en frío no carga el 3D y `/` no precarga su chunk.
- [Escena congelada](decisiones/blog/escena-congelada.md): con el blog abierto, `frameloop="never"` y `visibility: hidden`, nunca `display: none`.
- [Historial y salida](decisiones/blog/historial-y-salida.md): el anfitrión decide la salida; volver al índice deshace el historial, no empuja.
- [Cabeceras prerenderizadas](decisiones/blog/cabeceras-prerenderizadas.md): un documento por entrada con la cabecera SEO, no el cuerpo; la transformación falla cerrada.
- [Marca 3D en la cabecera](decisiones/blog/marca-3d-en-la-cabecera.md): el SVG primero, el 3D diferido; un segundo renderer fuera de la escena.
- [Entrada por la pantalla](decisiones/blog/entrada-por-la-pantalla.md): pantalla sobre `edificio-blog`, la aproximación es la transición y la vuelta es el mismo vuelo.
- [Captura de la página](decisiones/blog/captura-de-la-pagina.md): captura del blog construido o placa neutra; navegador confinado, sin sandbox solo en Vercel.

### Interfaz
- [El sitio está en español](decisiones/interfaz/idioma-del-sitio.md): todo texto visible en español, `lang="es"` en los tres documentos; solo el overlay de depuración queda fuera.
- [Cabecera única](decisiones/interfaz/cabecera-unica.md): una sola cabecera con portales; la línea medida coloca el logo; barra negra en el blog.
- [Menú del móvil](decisiones/interfaz/menu-movil.md): la vista se pliega como una tarjeta y descubre el menú; el mismo en la escena y en el blog.
- [Blog y Servicios](decisiones/interfaz/atajos-blog-y-servicios.md): dos atajos junto a las puertas, que son un recorrido y no un enlace; no van en la cabecera del blog.
- [Vidrio ahumado](decisiones/interfaz/vidrio-ahumado.md): un material en tres densidades, tokens en `siteHeader.css` y una sola barra de scroll.
- [Uso del azul](decisiones/interfaz/uso-del-azul.md): un solo azul en cuatro sitios; el azul fuera de la lista y los literales quedan pendientes.
- [Campos como líneas](decisiones/interfaz/campos-como-lineas.md): campos de línea fina; el rojo solo con un valor erróneo; desplegable de vidrio progresivo.
- [Tipografías](decisiones/interfaz/tipografias.md): General Sans y Gambetta en dos papeles, con nombres privados y declaradas una vez.
- [Pila de capas](decisiones/interfaz/pila-de-capas.md): la lista está en `styles.css`; reglas de orden que no se invierten.
- [Cursor propio](decisiones/interfaz/cursor-propio.md): montado una vez; cada fuente pide su estado al árbitro de su experiencia.
- [Glifos del cursor](decisiones/interfaz/glifos-del-cursor.md): path data incrustado, blanco con borde negro, `nonzero`.
- [Picking por coordenadas](decisiones/interfaz/picking-por-coordenadas.md): coordenadas del propio evento, dos tolerancias por tipo de puntero, detección por capacidad.
- [Gráficas del caso](decisiones/interfaz/graficas-del-caso.md): SVG a mano en cuatro tipos; color de marca solo en las marcas; gráfica opcional.

### Render y gráficos
- [Un renderer para la escena](decisiones/render/un-renderer-para-la-escena.md): un canvas, un renderer y un bucle de R3F; solo el pipeline dibuja; regla de los rAF; excepciones: precalentado fuera de pantalla y marca del blog.
- [Escenas separadas](decisiones/render/escenas-separadas.md): Earth y Murcia con su escena y su cámara; el logo lleva una tercera; la transición cambia qué escena se dibuja.
- [El pipeline dibuja un contrato](decisiones/render/el-pipeline-dibuja-un-contrato.md): `graphics/` no conoce experiencias; tres rutas elegidas por `SceneCanvas`; Earth se queda en la escena por defecto de R3F.
- [Configuración del renderer](decisiones/render/configuracion-del-renderer.md): todo en el `<Canvas>`; mismo límite de `dpr` también en móviles; `alpha: false` y su color de limpieza; WebGL 2.
- [Fallos de WebGL](decisiones/render/fallos-de-webgl.md): sin WebGL 2 no se evalúa la escena; la pérdida de contexto se declara y no se restaura.
- [Decodificadores compartidos](decisiones/render/decodificadores-compartidos.md): un Draco y un KTX2 con contador, que se sueltan al terminar la carga.

### Build y presupuestos
- [JS inicial de la portada](decisiones/build/js-inicial-de-la-portada.md): la puerta es todo el JS inicial de `/`, en bytes y peticiones, y no se sube; los techos por chunk y el del worker del dibujo son secundarios.
- [Precarga de la portada](decisiones/build/precarga-de-la-portada.md): `/` precarga todos los chunks salvo los que se abren por intención, y cada exclusión tiene su guarda.
- [three en su chunk](decisiones/build/three-en-su-chunk.md): three va aparte y solo se alcanza con un import dinámico.
- [Catálogo de three](decisiones/build/catalogo-de-three.md): R3F registra solo las clases de three que usa la app.
- [Depuración fuera de producción](decisiones/build/depuracion-fuera-de-produccion.md): las herramientas de depuración no llegan al bundle de producción.
- [Puerta de despliegue](decisiones/build/puerta-de-despliegue.md): `npm run build` es la puerta: checks, build, vista previa del blog y verificación de la salida.
- [Niveles de prueba](decisiones/build/niveles-de-prueba.md): unitarios, harnesses y e2e local; qué va en cada uno.
- [Producción y preview](decisiones/build/produccion-y-preview.md): los separa un solo valor, leído solo del entorno del proceso.
- [Salida verificada](decisiones/build/salida-verificada.md): la salida se revisa antes de publicarse.
- [Despliegue en Vercel](decisiones/build/despliegue-en-vercel.md): qué ejecuta Vercel, qué necesita del proyecto y cómo se cachea cada ruta.
- [Recursos publicados](decisiones/build/recursos-publicados.md): en `public/` solo está lo vigente, y lo que cambia cambia de nombre.
- [Entrega de la ciudad](decisiones/build/entrega-de-la-ciudad.md): un GLB y su carpeta de lightmaps con la misma versión; presupuesto de lightmaps por perfil.
- [Contrato del GLB](decisiones/build/contrato-del-glb.md): el GLB se comprueba leyendo su JSON; el build exige la parte de nombres y el check completo aún no va en la cadena.
- [Compresión y decodificadores](decisiones/build/compresion-y-decodificadores.md): Draco y KTX2, con los decodificadores de three.

### Arquitectura y módulos
- [Capas y dependencias](decisiones/arquitectura/capas-y-dependencias.md): aplicación → experiencias → infraestructura; Earth y Murcia no se conocen; `src/content/` es hoja; la lista de reglas es `checks/architecture.ts`.
- [Frontera de cada experiencia](decisiones/arquitectura/frontera-de-cada-experiencia.md): `App` orquesta; una pieza por mundo; Earth es un árbol de R3F y Murcia una clase, a propósito; la intención sale por callbacks.
- [Estado por fotograma](decisiones/arquitectura/estado-por-fotograma.md): lo que cambia por fotograma vive en objetos mutables con dueño; los lectores reciben vistas de solo lectura.
- [Movimiento del documento](decisiones/arquitectura/movimiento-del-documento.md): `prefers-reduced-motion` se lee una vez por documento, en el arranque o en la entrada.
- [Pestaña oculta](decisiones/arquitectura/pestana-oculta.md): los relojes de la escena solo avanzan con fotogramas; el delta está acotado; lo que mide tiempo de reloj o suena escucha la visibilidad.
- [Modelo de errores](decisiones/arquitectura/modelo-de-errores.md): fatal del sitio, ciudad que no se ofrece, adorno que se pierde con aviso; los invariantes lanzan.
- [Pantallas compartidas](decisiones/arquitectura/pantallas-compartidas.md): torre y campus comparten `screenPlayer` y `screenMesh`; cada adaptador pone su política; se cambia de lista, no de documento.

## Trampas

- [Cámara y navegación de Murcia](trampas/murcia-camara.md)
- [Transición y warp](trampas/transicion.md)
- [Intro y arranque](trampas/intro.md)
- [Escena de la Tierra](trampas/earth.md)
- [Contenido y CMS](trampas/contenido.md)
- [Formularios, consentimiento, analítica y legal](trampas/formularios-y-privacidad.md)
- [Blog](trampas/blog.md)
- [Interfaz](trampas/interfaz.md)
- [Render y gráficos](trampas/render.md)
- [Build y presupuestos](trampas/build.md)
- [Campus de servicios](trampas/campus.md)
- [Arquitectura y módulos](trampas/arquitectura.md)

## Contratos

- [Campos de Sanity](content/sanity-field-contract.md)
- [Medios de Sanity](content/sanity-media-contract.md)
- [Exportación desde Blender](murcia/blender-export-contract.md)
- [Especificación de logos para el cliente](earth/logo-spec.md)

## Registros y auditorías

- [Entrega de la ciudad v5.2-r1](murcia/lightmaps-v5.2-r1-integration.md): registro de la entrega vigente, en inglés; sus cifras son las de la entrega, no las del código. Se archiva cuando llegue otra.
- [Auditorías](audits/README.md): guías reutilizables (`audits/*.md`) e informes fechados (`audits/reports/`). Los informes son historia: sus hallazgos no se reescriben y los informes no se borran, y dan como abiertos problemas ya resueltos. `check:audit` vigila solo los informes. La última auditoría de seguridad es del 2026-09-02 y no cubre GA, Speed Insights ni las funciones de los formularios.
