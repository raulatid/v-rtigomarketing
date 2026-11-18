# Peso del proyecto y estrategia para bajar de 10 MB

**Fecha:** 2026-11-17. **Base:** árbol de trabajo sobre `1c9cd58`, con la entrega v5.2-r2 y otros cambios locales preexistentes, sin commit. Análisis solicitado del conjunto de la web, no solo del GLB.

Este informe complementa [el análisis de la ciudad](murcia-asset-weight-and-lightmaps-2026-11-17.md). Sus oportunidades sobre Draco ya están aplicadas en r2: no se contabilizan otra vez. Tampoco se toma como probado su diagnóstico del nivel de compresión del exportador: la [integración r2](../../murcia/lightmaps-v5.2-r2-integration.md) documenta el problema del codificador de Blender a nivel 6 y la recodificación con el de three.

**Etiquetas:** medido = archivos o navegador de esta pasada; código = comportamiento leído; anterior = evidencia de otro informe, sin nueva reproducción; objetivo/estimación = propuesta pendiente de prueba. MB = 1.000.000 bytes.

## Qué mide realmente la cifra

`resources` de Network cuenta tamaños de cuerpos después de la descompresión HTTP. No es el tráfico transferido ni la memoria de GPU. Un GLB con Draco sigue contando como GLB comprimido; no se suma su geometría expandida. Lo mismo ocurre con los KTX2: no se cuenta la textura ya transcodificada. Un recurso usado otra vez puede volver a aparecer en el registro aunque su cuerpo se reutilice desde caché.

Brotli, CDN y caché ayudan al tráfico y a las visitas siguientes, pero no hacen pequeño el conjunto de recursos que necesita una primera visita completa. La [documentación de Chrome](https://developer.chrome.com/docs/devtools/network/reference/) distingue ambos contadores.

Para el objetivo conviene fijar cuatro escenarios: primera entrada a Tierra, Tierra→Murcia, visita a servicios/casos/blog y visita repetida. Son presupuestos distintos. Si el objetivo es toda la experiencia, aplazar un archivo no permite declararlo eliminado.

## Referencia medida

Se sirvió el `dist/` existente mediante `vite preview`, sin recompilar ni regenerar contenido. Chrome instalado, controlado por Playwright, headless; un contexto nuevo por escenario, escritorio 1600×900 DPR 1 y móvil con descriptor Pixel 7. Observación de 40 segundos sin interacción. Se sumaron `PerformanceResourceTiming.decodedBodySize`, `encodedBodySize` y `transferSize`. No se incluye el HTML principal en estas sumas de entradas de tipo `resource`.

| Escenario | Resources, cuerpos tras descompresión HTTP | Transferencia observada, incluidas cabeceras |
|---|---:|---:|
| Escritorio, sin activar música | 16,806 MB | 15,367 MB |
| Móvil emulado, sin activar música | 12,983 MB | 11,544 MB |
| Escritorio, audio desbloqueado y Tierra→Murcia | 18,563 MB | — |

77 entradas de recursos por escenario; ningún `pageerror`. Son una referencia local, no una certificación de producción. En este `dist/` falta la captura generada del blog: su petición de manifiesto recibe el HTML de fallback de Vite, y el panel usa su sustituto. No se midieron Analytics, CDN de producción, Safari real ni GPU de móvil. No se atribuyen tiempos de render a hardware real a partir del headless.

El bloque mayor se ha verificado también directamente en los archivos: GLB r2 3.673.964 bytes; veinte lightmaps del perfil desktop 6.488.961 bytes y del móvil 4.489.081 bytes. En la tabla siguiente se separa el manifiesto de esos veinte KTX2.

| Bloque en escritorio | MB observados |
|---|---:|
| Lightmaps de Murcia, solo KTX2 | 6,489 |
| GLB de Murcia r2 | 3,674 |
| Tierra: día, noche, nubes | 1,995 |
| JavaScript, CSS y worker de dibujo | 1,583 |
| Decodificadores Basis y Draco, contando las entradas repetidas | 1,087 |
| Logos, imagen de torre y favicon | 1,019 |
| Otros modelos: satélite, isotipo y vehículos | 0,486 |
| Cielo, textura del satélite y manifiesto de lightmaps | 0,271 |
| Fuentes | 0,116 |
| Efectos de sonido | 0,080 |
| Petición del manifiesto de captura del blog, fallback local | 0,005 |
| **Total** | **16,806** |

Los lightmaps y GLB de Murcia son el 60,5 % de esta referencia. Las texturas de Tierra añaden el 11,9 %. Es ahí donde una intervención cambia los megabytes del conjunto.

En otra carga desktop se esperaron 25 s, se rechazaron cookies (gesto que permite desbloquear audio), se esperaron 5 s, se enfocó `.nav-control` y se pulsó Enter para viajar a Murcia; se observaron otros 15 s. La música de Tierra añadió 1.047.552 bytes y la de Murcia 665.088 bytes. Ambas juntas añaden 1,713 MB. El total observado fue **18.563.192 bytes**, con el host de Murcia visible y ambas pistas solicitadas. Incluye otra entrada del favicon de 44.389 bytes cuyo cuerpo se reutilizó, con solo 300 bytes transferidos. Esto reproduce aproximadamente los 18,6 MB del usuario, aunque no prueba que su build y recorrido sean idénticos ni certifica todos los estados visuales de la visita.

Fuentes de la política de audio: [backgroundMusic.ts](../../../src/app/audio/backgroundMusic.ts) y [soundEffects.ts](../../../src/app/audio/soundEffects.ts). La música ya usa streaming y `preload='none'`: su peso en disco no se debe atribuir automáticamente a todas las entradas.

## 1. Lightmaps: cambiar la distribución de información

### Prioridad inmediata: dos atlas de 2,37 MB

`landmark-cathedral-2048` pesa 1.386.832 bytes y `rooftop-parapets-2048` 979.827. Sus cabeceras confirman UASTC+Zstd; la catedral tiene dos niveles y los pretiles uno. El resto del conjunto usa otra distribución de resoluciones/códecs.

La prueba del informe anterior situaba ETC1S q192 alrededor del 30 % del UASTC en el nivel principal y estimaba unos 1,6 MB de ahorro conjunto en escritorio. **Es una oportunidad anterior, no un ahorro validado visualmente aquí.** La comparación era contra el UASTC entregado, no contra el master; el error global incluía mucho atlas vacío.

La prueba correcta debe comparar master, UASTC con RDO y ETC1S de calidad alta en el render final, especialmente bordes, degradados y zonas oscuras. Puede acabar en un resultado mixto: conservar UASTC donde aporte y separar superficies simples. No requiere cambiar de cargador.

KTX2 es un contenedor, no una garantía de tamaño mínimo. La elección entre ETC1S y UASTC y el uso de RDO tienen compromisos distintos, documentados por [Khronos](https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html).

### Rehorneado guiado por las cámaras

El informe anterior calculó una ocupación aproximada del 34 % en el perfil desktop, como suma de áreas UV, sin descontar solapes ni incluir márgenes. No significa que se pueda quitar el 66 % del peso: ETC1S comprime bien las zonas uniformes y los gutters son necesarios. Sí indica que la distribución del atlas merece revisión.

Propuesta de metodología:

1. Muestrear las cámaras realmente permitidas: llegada, extremos de navegación y zoom, servicios, Conócenos, hitos y ambas proporciones de pantalla.
2. Asignar densidad por detalle proyectado y contraste visible, no por «un 2048 para cada cuadrante».
3. Empaquetar por densidad y margen explícitos; reservar calidad a suelo cercano y siluetas reconocibles.
4. Hornear de forma coherente las superficies que comparten borde antes de separarlas. El corte del suelo ya documentado obliga a proteger esa continuidad.
5. Emitir perfiles que puedan conservar detalle en un suelo concreto y reducir un edificio lejano, en escritorio o móvil.

El mecanismo de resoluciones por atlas ya existe en [unifiedManifest.ts](../../../src/experiences/murcia/assets/lightmaps/unifiedManifest.ts); no hace falta inventar una arquitectura nueva para probar mezclas. El perfil móvil ya conserva varios atlas a 2048: **no es una reducción proporcional del escritorio**.

### Cambiar la representación de la luz

El informe anterior identificó 22.870 ventanas entre 23.303 instancias. Para ventanas que apenas muestran unos pocos téxeles, un color de iluminación por instancia puede sustituir una celda de lightmap y su rectángulo UV. Los árboles y objetos con degradados útiles pueden conservar atlas. La estimación anterior era de unos 0,8 MB sumando datos de instancias y texturas; se debe recalcular sobre la solución concreta y evitar sumar de nuevo ese ahorro a una compactación de los mismos atributos.

Los edificios de fondo son candidatos a luz por vértice, gradientes o una pequeña paleta de iluminación. No hace falta que una ventana distante y una fachada protagonista compartan la misma representación. Esto cambia datos y shaders y exige revisar el aspecto nocturno/oscurecido.

## 2. Geometría: diseñar para el recorrido disponible

El GLB r2 contiene 2.236.087 bytes de Draco, unos 1,305 MB de atributos de instancias, 116.780 bytes de JSON y una imagen pequeña. Los atributos muertos ya se retiraron o colapsaron en la entrega. «Poner Draco» no es un siguiente paso.

En r2, los tres grupos `CITY_B/C/D_SIMPLIFIED` suman 947.236 bytes de Draco. La mayor oportunidad geométrica adicional está en **cuánta ciudad necesita existir con detalle**, no en otra minificación del archivo.

Propuestas para una siguiente entrega de Blender:

- Sustituir detalle de fondo por volúmenes que conserven silueta, color y oclusión relevantes. No usar un porcentaje uniforme de decimación para todos los objetos.
- Eliminar caras y piezas que ninguna cámara admitida puede mostrar. El objetivo de navegación está limitado, pero el ojo puede rodearlo: hay que usar la envolvente real y el barrido de `checks/footprint.ts`.
- Para zonas lejanas, valorar una malla de silueta o impostores. Solo son apropiados donde el movimiento de cámara no revele su planitud.
- Probar menos bits de posición/UV por categoría con error máximo en píxeles y en fracciones de téxel, sin bajar globalmente todas las superficies.
- Compactar atributos de instancias: rotación normalizada, omitir escalas unitarias donde todo el grupo lo permita y estudiar `_LIGHTMAP_ST` normalizado. Requiere validar los accesores y el runtime; no basta con cambiar el tipo en el JSON.

La [extensión de instancing de Khronos](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing/README.md) admite rotaciones enteras normalizadas. No se propone un cambio general a Meshopt: añadir otro decodificador solo merece la pena si una comparación del archivo completo, los tiempos de carga y el soporte demuestra una ganancia neta.

La compactación de instancias reduce `resources`. Su ahorro de transferencia puede ser menor cuando el CDN ya aplica Brotli a esos floats. La documentación local de r2 registra Brotli en Vercel; no se ha vuelto a comprobar esa respuesta en esta pasada.

## 3. Tierra: 1,13 MB en una máscara de nubes

Medido por archivo y cabecera:

| Mapa desktop | Dimensiones | Tamaño |
|---|---|---:|
| Día | 4096×2048, 13 niveles | 545.086 B |
| Noche | 4096×2048, 13 niveles | 320.156 B |
| Nubes | 4096×2048, 13 niveles | 1.129.489 B |

Todos son ETC1S/BasisLZ; recomendar «convertir las nubes a ETC1S» repetiría lo ya aplicado. El [shader](../../../src/experiences/earth/shaders/earth/fragment.glsl) solo lee `.r`, aplica un umbral y mezcla hacia blanco.

Prueba propuesta: conservar el detalle del mapa de día y hacer una variante intermedia 2048×1024 para nubes. Comparar desde el zoom más cercano, durante rotación y cerca del terminador, no solo en una imagen general. Objetivo experimental para nubes: 0,25–0,40 MB, **no medido**. Después, estudiar noche a menor resolución si sus luces conservan la lectura.

No servir sin más el conjunto móvil a desktop: sus mapas son 1024×512 y el proyecto ya vincula esa resolución a un límite de acercamiento. Cambiar cámara es una alternativa de diseño válida, con coste de experiencia explícito.

No quitar los mipmaps de la esfera para ahorrar: sirven a la calidad en movimiento. Tampoco cambiar indiscriminadamente KTX2 por AVIF/WebP: estos pueden ahorrar descarga pero expandirse al subir a GPU. [Three.js explica la diferencia entre tamaño de imagen y memoria de textura](https://threejs.org/manual/pages/textures.html).

## 4. Política de carga: una entrada paga los dos mundos

Por código, [cityBytes.ts](../../../src/experiences/murcia/assets/cityBytes.ts) precarga el GLB, el manifiesto y todos los atlas seleccionados. [MurciaLayer.tsx](../../../src/experiences/murcia/MurciaLayer.tsx) solicita red durante la apertura y construye después. En la medición desktop, el GLB y atlas empiezan alrededor de 3,3 s, estando todavía en Tierra.

La política tiene un beneficio concreto: la navegación espera a una ciudad lista y la transición puede ser inmediata. Su coste mínimo de contenido de ciudad son 10,16 MB para cualquiera que llegue a esa fase, aunque nunca visite Murcia.

Alternativas, de menor a mayor cambio:

- Cargar primero una ciudad suficiente para aterrizar y completar contenido secundario después.
- En conexiones lentas o con ahorro de datos, esperar una intención clara de viaje antes de descargar la ciudad completa.
- Separar núcleo navegable, periferia y medios de secciones. Los límites de las piezas deben seguir la visibilidad y el uso, sin multiplicar indiscriminadamente peticiones o draw calls.
- Si se acepta espera al primer viaje, introducir un estado visual preparado para ella. Debe diseñarse, no confiar en que el warp oculte cualquier latencia.

Esto reduce el coste de una visita que se queda en Tierra. **No reduce el coste total de quien visita todo**, salvo que el contenido que recibe sea también más pequeño. Un LOD bajo y otro alto descargados en la misma sesión pueden incluso aumentar el total. Para una meta de sesión completa, la geometría ya cargada debe poder reutilizarse o el LOD debe sustituir contenido que nunca se descarga.

## 5. Contenido y audio: presupuestar desde la edición

Los diez logos suman 546 KB; una imagen PNG de torre suma 428 KB; el favicon mide 2000×2000 y 44 KB. El medio replicado conserva el formato de la subida al redimensionar: [mirror.ts](../../../content/lib/mirror.ts). Tener un límite de dimensiones no equivale a un límite de bytes.

- Añadir variantes de entrega por función: transparencia y bordes de logo frente a fotografía de pantalla. Probar WebP sin pérdida o paletización para marcas; AVIF/WebP con pérdida para fotografía cuando la calidad lo permita.
- Generar un favicon del tamaño necesario.
- Preparar las imágenes de torre para su tamaño proyectado y cargar la diapositiva próxima en vez de toda la biblioteca a medida que crezca.
- Separar la marca pequeña visible desde el inicio de la versión de detalle al seleccionar, si el ahorro justifica las variantes. Cargar ambas para todos solo duplicaría trabajo.
- Mostrar en el pipeline editorial cuánto añade una imagen al presupuesto de la visita, además de si cumple el formato.

Música: los dos archivos suman 1,713 MB. Un bucle más corto y bien cerrado puede ahorrar sin bajar el bitrate. Comparar duración, estéreo y códec con escucha real; Opus es una variante a comprobar con los navegadores objetivo, no una sustitución automática. Presupuesto inicial propuesto para ambas pistas y efectos: 0,50–0,70 MB. Es un objetivo creativo/técnico, pendiente de codificación y escucha.

El streaming actual es adecuado para evitar PCM de larga duración en memoria. Cambiarlo por `decodeAudioData` para toda la música empeoraría ese aspecto.

## 6. Código, CPU, GPU y caché

El código y estilos son relevantes para el arranque, pero no explican la mayor parte del peso. De 1,583 MB en esta medición se transfieren unos 0,483 MB en ese grupo gracias a la compresión local. Los grandes recortes de geometría y texturas tienen más recorrido para el objetivo de `resources`.

La política de modulepreload se basa en excluir algunas ramas de un conjunto amplio de chunks: [vite.config.ts](../../../vite.config.ts), `isPreloadedOnIndex`. A medida que crece el producto, conviene expresar qué necesita cada fase y comprobar el conjunto real. Una nueva importación dinámica no garantiza carga tardía si el HTML la precarga.

Hay dos cargas del wrapper/WASM Draco: una para los modelos tempranos y otra para la ciudad. La segunda reutiliza el cuerpo y solo transfiere unos 600 bytes en total en esta observación. Sí vuelve a sumar tamaños cargados al registro. Su ciclo de vida actual libera workers para reducir residencia: no propondría retenerlos solo para mejorar el contador.

Se observaron tareas largas, incluida una de 271 ms durante la preparación de Murcia. Sin traza de atribución y GPU real no se identifica su causa ni se convierte en un diagnóstico de cuello de botella. Para rendimiento percibido faltaría medir por separado descarga, Draco, Basis, construcción, subida a GPU y primer cuadro utilizable.

El informe de Murcia de septiembre encontró presión de memoria y pausas de primera entrada, pero corresponden a otra entrega. No se trasladan sus MB de VRAM o tiempos a r2. Son puntos que volver a perfilar si el trabajo se amplía a fluidez.

Cambiar caché/CDN, bajar DPR, eliminar draw calls y recortar recursos resuelven problemas diferentes. Bajar DPR puede reducir mucho el coste de render y no quitar un solo byte a un GLB ya descargado.

## Objetivo de reparto para una experiencia completa

Ejemplo de presupuesto, **no predicción de resultado**. Incluye ambos mundos y sonido; excluye el crecimiento arbitrario por leer todos los artículos y medios del blog.

| Bloque | Objetivo MB |
|---|---:|
| Lightmaps y luz de Murcia | 3,20 |
| GLB de Murcia | 2,00 |
| Texturas de Tierra | 1,00 |
| Código, CSS y workers | 1,40 |
| Decodificadores, incluidas cargas repetidas si persisten | 1,10 |
| Otros modelos y cielo | 0,60 |
| Medios, fuentes, manifiestos y captura de blog | 0,60 |
| Ambas músicas y efectos | 0,60 |
| **Total de trabajo** | **10,50** |

Ese reparto todavía **no alcanza** el objetivo. Para dejar margen real habría que llevar el conjunto a unos 9,3–9,5 MB: por ejemplo, luz de ciudad a 2,70 MB, GLB a 1,70 MB y Tierra a 0,80 MB darían 9,50 MB. Son metas exigentes que requieren cambios de representación y validación; no salen de una única conversión de formato. Es preferible enseñar esta cuenta que prometer menos de 10 MB sumando ahorros incompatibles.

La primera pasada de códecs, nube intermedia y medios tiene una oportunidad aproximada de 2,5–3,0 MB desde la referencia sin música. Por sí sola probablemente la dejaría por encima de 13 MB. El resto depende de rehornear, simplificar el fondo, cambiar ventanas/instancias y acotar el audio.

## Orden recomendado y criterio de aceptación

1. Fijar el recorrido del presupuesto: arranque, Tierra→Murcia con música y secciones representativas. Usar siempre cache fría y el mismo build/contenido; registrar también repetición.
2. Probar los dos atlas UASTC, la nube intermedia y las variantes editoriales. Registrar bytes del archivo entero, aspecto y memoria resultante.
3. Preparar una entrega de Blender orientada al recorrido: densidades de luz, ventanas por instancia, fondo con luz por vértice/volúmenes y atributos compactos. Medir cada familia antes de rehacer la ciudad completa.
4. Resolver si la transición inmediata merece la precarga completa. El diseño de carga se decide junto a la experiencia, con prueba en red lenta.
5. Recortar/recodificar los bucles de audio y verificar el coste con y sin sonido.
6. Añadir un presupuesto total de navegador por recorrido. Los presupuestos actuales de JS y lightmaps no cubren todos los medios, audio, modelos y peticiones indirectas.

Para cada variante: bytes cargados y transferidos, diferencia visual en cámaras fijas y movimiento, tiempos hasta Tierra utilizable y Murcia navegable, pausa al entrar, pico y residencia de memoria. En texturas, medir error solo en islas útiles y revisar bordes/gutters; una puntuación media del atlas vacío no decide la calidad. En geometría, exigir error de silueta proyectado. Validar al menos un Android y Safari/iOS reales para las decisiones de GPU/transcodificación.

Los budgets son decisiones de producto: cuánto detalle recibe un visitante, desde dónde puede verlo y qué necesita antes de actuar. [MDN](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Performance_budgets) describe el uso de presupuestos vinculados a experiencia y recursos.

No se modificó código de producto ni ningún GLB, KTX2 o contenido editorial. Las pruebas de navegador son instrumentación de lectura; este informe es el único archivo de proyecto añadido por esta pasada.
