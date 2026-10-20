# Documentación de vgc

Índice de las decisiones vigentes. Si vas a cambiar algo de un área, lee antes su decisión y su archivo de trampas.

## Reglas de esta documentación

1. **Idioma:** la documentación vigente se escribe en español. El código, los identificadores, los nombres de archivos de código y los mensajes de commit siguen en inglés. Lo archivado se queda en su idioma original.
2. **Una decisión por archivo, siempre en estado actual.** Si una decisión cambia, se reescribe; la versión anterior queda en git o en `archivo/`. No se acumulan enmiendas.
3. **Los números no se copian, se enlazan.** Se cita la constante y su archivo («`CAMERA_DISTANCE` en `murciaConfig.ts`»), no su valor. El porqué de cada cifra vive en el comentario junto a la constante.
4. **Campos de una decisión:** estado, desde cuándo y a qué sustituye; decisión; por qué; qué se descartó; se ha roto si…; afecta a (rutas).
5. **Las trampas** (errores conocidos y comportamientos que parecen bugs pero son intencionados) van en `trampas/`, agrupadas por área.

## Migración en curso

La documentación anterior (`DECISIONS.md`, `PROJECT_MEMORY.md`, `ARCHITECTURE.md`, `ENGINEERING_PRINCIPLES.md`, `adr/`) se está migrando por áreas. Una entrada antigua marcada como **Migrada** es historia: la fuente válida es el archivo nuevo al que apunta. Lo que aún no está migrado sigue en su sitio y puede estar desfasado.

| Área | Estado |
|---|---|
| Cámara y navegación de Murcia | migrada |
| Transición / warp | migrada |
| Intro y arranque | migrada |
| Escena de la Tierra | migrada |
| Interfaz y contenido (cabecera y menú, cursor, picking, vidrio, tipografías, datos de casos) | pendiente |
| Formularios, consentimiento y legal | migrada |
| Contenido / CMS | migrada |
| Blog | migrada |
| Render y gráficos (ADR 001, 002, 008) | pendiente |
| Build y presupuestos | pendiente |

Los documentos sustituidos por completo se mueven a [`archivo/`](archivo/), conservando su ruta relativa (`content/x.md` → `archivo/content/x.md`), y se actualizan los enlaces que apuntan a ellos.

## Decisiones

### Intro y arranque
- [Arranque sin dependencias](decisiones/intro/arranque-sin-dependencias.md): el chunk de arranque no importa nada y tiene presupuesto.
- [Carga real y disponibilidad](decisiones/intro/carga-real-y-disponibilidad.md): progreso visual, progreso medido y disponibilidad son tres cosas.
- [Plazo de carga](decisiones/intro/plazo-de-carga.md): el plazo solo puede fallar; las decoraciones no son fatales.
- [Ritmo del dibujo](decisiones/intro/ritmo-del-dibujo.md): segundos visibles, ritmo uniforme, dibujo en un worker.
- [Máquina de apertura](decisiones/intro/maquina-de-apertura.md): fases ordenadas, tres caminos de entrada, reloj propio sin gsap.
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

### Murcia
- [Pose de reposo](decisiones/murcia/pose-de-reposo.md): todos los hitos en plano al aterrizar.
- [Modelo de entrada](decisiones/murcia/modelo-de-entrada.md): un puntero mueve giro y avance; el mundo sigue al dedo; ganancia e inercia propias para el dedo.
- [Sensación de cámara](decisiones/murcia/sensacion-de-camara.md): muelles que aterrizan, zoom críticamente amortiguado, inclinación hacia el cursor.
- [Límites de la cámara](decisiones/murcia/limites-de-camara.md): solo se limita el objetivo, al anillo A2; `check:footprint` es la garantía.
- [Brújula](decisiones/murcia/brujula.md): rumbos en el suelo, blanca, sobre la cabecera, no es un control.
- [Edificios interactivos](decisiones/murcia/edificios-interactivos.md): parpadeo y geotags.

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

## Trampas

- [Cámara y navegación de Murcia](trampas/murcia-camara.md)
- [Transición y warp](trampas/transicion.md)
- [Intro y arranque](trampas/intro.md)
- [Escena de la Tierra](trampas/earth.md)
- [Contenido y CMS](trampas/contenido.md)
- [Formularios, consentimiento, analítica y legal](trampas/formularios-y-privacidad.md)
- [Blog](trampas/blog.md)

## Contratos

- [Campos de Sanity](content/sanity-field-contract.md)
- [Medios de Sanity](content/sanity-media-contract.md)
- [Exportación desde Blender](murcia/blender-export-contract.md)
- [Especificación de logos para el cliente](earth/logo-spec.md)
