# Peso de la experiencia de la Tierra: hacia menos de 5 MB

**Fecha:** 2026-11-18. **Base:** `9bd74a4`. La build de producción medida es del mismo día, se hizo antes de los commits de la pasada anterior y su contenido es equivalente. Continúa el [informe del 2026-11-18](project-resource-budget-2026-11-18.md), que dejó la visita completa en 9,83 MB.

**Alcance:** el objetivo es bajar el proyecto de 5 MB sin perder calidad visual. Este informe cubre solo la experiencia de la Tierra: texturas, cielo, decodificadores, JS, satélite, marcas, audio, fuentes y la orquestación de carga. Murcia solo entra en cuanto a cuándo la precarga la Tierra. No se implementó nada.

**Etiquetas:** **medido** = archivos, navegador o scripts de esta pasada; **estimado** = calculado sin construir la variante; **leído** = comportamiento leído en el código. MB = 1.000.000 bytes.

## Cómo se midió

- **Navegador:** el `dist/` de producción servido con `vite preview` y medido con Playwright y Chrome. Contexto nuevo, caché fría, 40 s sin viajar, sumando `decodedBodySize` (el contador «resources» de DevTools). Escritorio a 1600×900 y Pixel 7 emulado.
- **Bundles:** chunks de `dist/assets`, atribución por módulo con el `esbuild` de `node_modules` y cobertura V8 en una sesión de 30 s.
- **Texturas:** cabeceras KTX2 (DFD, KVD y SGD) leídas con Node. Recodificaciones de prueba con `ktx`/`toktx` 4.4.2 y ffmpeg (libaom, libwebp), con PSNR y SSIM contra los másteres de `04_Assets/texturas-tierra/`.
- **Geometría:** el GLB del satélite inspeccionado con Node. Simplificación de prueba con `meshoptimizer` y el codificador Draco de three.
- Los scripts y las variantes de prueba viven fuera del repositorio.

### Corrección al método del informe anterior

Chrome sin ventana reproduce audio sin gesto, incluso con `--autoplay-policy=user-gesture-required`. Por eso las cifras «sin viajar» del informe anterior (9,40 MB en escritorio y 8,59 MB en móvil) incluyen la música de la Tierra (672.131 B) y una segunda petición del favicon (18.206 B). En un Chrome con ventana y sin ningún gesto, `play()` se rechaza y la visita sin viajar suma **8.709.691 B** (medido). La música llega con el primer clic, toque o tecla, por ejemplo al responder al banner de cookies.

| Escenario | Total | Entradas |
|---|---:|---:|
| Escritorio 1600×900, sin ventana (cuenta la música) | 9.400.028 B | 77 |
| Pixel 7 emulado, sin ventana (cuenta la música) | 8.592.900 B | 77 |
| Chrome con ventana, sin gesto | 8.709.691 B | 75 |

Las dos primeras cifras reproducen exactamente las del informe anterior.

## Resumen

1. **Más de la mitad de una visita que no sale de la Tierra es Murcia:** 4,77 de 9,40 MB. La precarga arranca al empezar `shrink`, unos 3,5 s después de cargar.
2. **El mayor ahorro propio de la Tierra es de formato.** Día, noche y nubes en AVIF en lugar de KTX2/ETC1S ahorran entre 0,59 y 0,79 MB, con mejor calidad que hoy. A cambio, la memoria de GPU sube de unos 25 MB a 70–92 MB.
3. **El transcodificador Basis recortado** a ETC1S ahorraría de 0,30 a 0,43 MB también en la visita completa. Exige cambiar la regla de la copia exacta.
4. **El resto son recortes de 30 a 130 KB cada uno:** logotipos bajo demanda, satélite simplificado, efectos de sonido, Switzer, diálogos en diferido, GLSL y fuentes.
5. **Con todo, la visita sin viajar quedaría en unos 2,9 MB con música y 2,2 sin gesto** (estimado). En la visita completa, la Tierra seguiría costando unos 3 MB, así que Murcia tendría que caber en unos 1,5 MB contando su música.

## Reparto de la visita sin viajar (medido)

| Bloque | Escritorio | Móvil |
|---|---:|---:|
| Precarga de Murcia (chunks, GLB, lightmaps, vehículos, torre, manifiesto, efecto `district`) | **4.773.851** | **4.773.851** |
| Compartido: Basis 584.862 + Draco 250.876 | 835.738 | 835.738 |
| Propio de la Tierra, con música | 3.790.439 | 2.983.311 |
| Propio de la Tierra, sin música | 3.118.308 | 2.311.180 |

- La Tierra necesita Draco solo por el satélite (172.748 B) y el isotipo 3D (4.148 B).
- Necesita Basis por sus texturas y la del satélite.
- `draco/draco_decoder.js` (512.465 B) no se pide nunca: three solo lo usa sin WebAssembly (`DRACOLoader.js:274`, leído).
- `murcia-*.m4a` no se pide en la Tierra: una pista solo se crea cuando su volumen objetivo es mayor que 0 (`backgroundMusic.ts:90,140`).

Solo con no precargar Murcia, la visita sin viajar baja de 9,40 a 4,63 MB en escritorio (3,94 sin gesto) y de 8,59 a 3,82 MB en móvil (3,13 sin gesto). La visita completa no cambia.

## Línea temporal en la Tierra (escritorio, medido)

Hitos: `scene-ready` a 2,0 s, `intro-complete` (empieza `shrink`) a 3,5 s y `site` a unos 13,3 s. La ciudad queda lista y el botón de viaje pasa a `idle` unos 1,4 s después de `site`.

| t (ms) | Disparador | Recursos | Bytes | Mundo |
|---:|---|---|---:|---|
| 107–247 | `index.html`: scripts, CSS, modulepreload | JS y CSS de la app (three, SceneCanvas, chunk compartido, `index`, intro, worker…) | 1.299.888 | Tierra |
| 107 | preload | Gambetta y General Sans | 73.268 | Tierra |
| 107 | preload | día, noche, nubes (KTX2) y cielo AVIF | 1.075.310 | Tierra |
| 107 | preload, prioridad baja | `satellite.glb` | 172.748 | Tierra |
| 107 | preload | `vertigo-isotipo-3d.glb` | 4.148 | Tierra |
| 108 | modulepreload, prioridad baja | `MurciaExperience` + `disposal` | 216.149 | Murcia |
| 399 | segunda fuente de `--font-display` (`siteHeader.css:121`) | Switzer | 43.220 | Tierra (no dibuja nada) |
| 415 | `<link rel=icon>` | favicon de 512 | 18.206 | Tierra |
| 524 | `import()` de la escena | CSS de SceneCanvas | 19.867 | Tierra |
| 969–993 | montaje de la escena | textura del satélite 127.061, 10 marcas 204.946, Basis 584.862 | 916.869 | Tierra |
| 1.450 | GLTF con Draco | Draco: wrapper + wasm | 250.876 | compartido |
| 3.515–3.580 | `shrink` admite trabajo `'network'`: `prefetchCityBytes` (`MurciaLayer.tsx:137`) | GLB de la ciudad 2.615.876, `lightmaps.json` 23.597, 20 atlas a 1024 1.837.076 | 4.476.549 | Murcia |
| 13.268 | `site`: se crea el AudioContext y se precargan los efectos (`soundEffects.ts:167`) | warp 50.688, district 18.816, audit 10.752 | 80.256 | Tierra (salvo district) |
| 13.298 | `site`: `play()` (en Chrome real, con el primer gesto) | `earth-*.m4a` | 672.131 | Tierra |
| 13.478 | Chrome pide el icono de los controles multimedia | favicon otra vez | 18.206 | — |
| 13.908–14.348 | `site` admite trabajo `'main'`: se construye la ciudad (`MurciaLayer.tsx:165`) | tráfico 8.470, 6 vehículos 19.920, pantalla de la torre 28.534, `blog-preview.json` 5.413 | 62.337 | Murcia |

- El móvil sigue la misma secuencia con las texturas `-narrow` (219.499 B en vez de 978.870) y el cielo estrecho (48.683 B).
- El `dist/` medido no tiene `/generated/blog-preview.json` y devuelve el HTML de reserva. En producción el manifiesto es real y va seguido de una captura WebP de unos 66–79 KB (estimado), así que allí la precarga de Murcia pesa algo más.

## Qué se ejecuta en la Tierra (medido sobre `dist/`)

**Carga inicial.**
- `index.html` lleva dos `<script>`: `intro` (17.569 B) e `index` (56.496 B).
- Precarga con modulepreload `three` (649.785), `SceneCanvas` (266.342) y el chunk compartido `googleAnalytics-*` (225.858).
- Además, seis chunks pequeños (9.611) y, con `fetchpriority=low`, `MurciaExperience` (215.751) y `disposal`.

**Contenido de los chunks** (estimado por atribución):
- **`three`:** el núcleo con `WebGLRenderer` ronda 555 KB, de los que 158 KB son `ShaderChunk`. Los cargadores suman unos 67 KB y el postprocesado unos 20 KB.
- **`SceneCanvas`:** R3F y sus dependencias ocupan unos 158 KB; el resto, unos 100 KB, es la Tierra.
- **`googleAnalytics`:** react-dom, react y scheduler suman unos 188 KB; unos 38 KB son código de la app compartido con el blog.

**Lo que es de Murcia y se paga sin viajar:** 244.088 B. Son `MurciaExperience`, `createTraffic` y `murcia.css`, que vive en el chunk de `SceneCanvas` porque lo importa `MurciaLayer.tsx:15`.

**Cobertura** (sesión de 30 s sin interacción, con la ciudad bloqueada):
- Se ejecuta el 50 % de `three` (324.548 de 649.785 B).
- CSS usado: 15.308 de 44.740 B en el CSS compartido, 6.641 de 20.108 en `index` y 134 de 19.865 en `SceneCanvas`.
- Un byte que no se ejecuta en esa sesión no tiene por qué poder quitarse.

No hay polyfills ni código de depuración, salvo el shader de `SkyShellCube`, que sigue en producción (`EarthExperience.tsx:10,125`).

## Representación visual de la Tierra

### Inventario (medido)

Todas las texturas son vkFormat 0, ETC1S/BasisLZ, con mips completos.

| Archivo | Bytes | Tamaño | Transferencia | qlevel |
|---|---:|---|---|---:|
| `day.ktx2` | 545.086 | 4096×2048 | sRGB | 128 |
| `night.ktx2` | 320.156 | 4096×2048 | sRGB | 128 |
| `clouds.ktx2` | 113.628 | 2048×1024 | sRGB | 180 |
| `day-narrow.ktx2` | 71.682 | 1024×512 | sRGB | 180 |
| `night-narrow.ktx2` | 46.643 | 1024×512 | sRGB | 180 |
| `clouds-narrow.ktx2` | 101.174 | 1024×512 | sRGB | 180 |

- **Cielo:** `sky-panorama.avif`, 4096×2049, 96.440 B, yuv420p de 8 bits; la versión estrecha mide 2048×1025.
- **Estrellas y atmósfera:** son procedurales, sin recursos.
- **Un solo juego por visita.** Lo eligen las precargas con `media` (`index.html:108-154`) y `usesNarrowEarthTextures()` (`earthConfig.ts:112-119`). La duplicación entre ancho y estrecho cuesta espacio en el despliegue, no bytes en la visita.
- **Nubes:** el shader solo usa `.r`, con `smoothstep(0.5, 1.0)` tras la decodificación sRGB. Sobre el máster, las nubes visibles cubren el 1,5 % de la superficie.
- **Día y noche:** el sol está fijo y la Tierra gira, así que con el tiempo se ve todo el globo de día y de noche.

### Resolución visible

Píxeles de pantalla por téxel en el centro del disco (calculado):

| Pose | 1920×1080, DPR 1 | 1440×900, DPR 2 | 390×844, DPR 2 |
|---|---|---|---|
| Reposo | 0,29× | 0,48× | 1,6× (mapas de 1024) |
| Zoom cercano | 0,77× | 1,28× | 2,5× |
| Primer plano de un satélite, órbita interior | 1,01× | 1,69× (con 2048 serían 3,4×) | 5,4× |
| Warp a Murcia | 1,47× | 2,44× | — |

En reposo bastaría un mapa de 2048, pero el zoom cercano y los primeros planos necesitan 4096. Esos encuadres pueden caer en cualquier longitud y hasta unos 81° de latitud (`phiMin` 0,15, `interactionConfig.ts:32`). No hay una zona fija de acercamiento: una inserción regional o un sistema de tiles no ahorra sin cambiar el producto.

## Oportunidades

### Cambios de planteamiento

**A. Murcia por intención o por niveles: −4.773.851 B sin viajar (medido), 0 en la visita completa.**
- **Punto de enganche:** ya existe en `scheduleWork('network')` y `scheduleWork('main')` (`MurciaLayer.tsx:137,165`). Hay que aplazar las dos fases: si la construcción sigue en `site` sin los bytes adelantados, `cityBytes` los descarga igualmente.
- **Tiempos medidos** (sin ventana, no es hardware real):
  - construcción con los bytes ya descargados: unos 1,4 s en escritorio y 3,4 s en Pixel 7 con la CPU 4× más lenta;
  - descarga del GLB con 4G emulado a 9 Mbps: 4,1 s;
  - ventana entre la intención y el corte del warp: unos 2–4 s.
- **Opciones:**

  | Opción | Ahorro sin viajar | Qué ve el usuario |
  |---|---|---|
  | Actual: bytes en `shrink`, construcción en `site` | 0 | Viaje inmediato; tirón de ~1 s en `site` en móvil lento |
  | Precarga en reposo (`site` + T s) | 0 en la medida de 40 s | Solo mueve los bytes dentro de la ventana de medida |
  | Por intención fuerte (banda de zoom, hover o foco del botón, enlaces a Murcia) | −4,77 MB | Escritorio con banda ancha: casi oculto. Móvil con 4G: unos 7–8 s de espera |
  | Por niveles: chunk en reposo, bytes con el primer gesto, construcción con intención fuerte | −4,56 a −4,77 MB para quien no interactúa | Exige diseñar la espera |
  | Según la red (`saveData`, `effectiveType`) | 0 en el laboratorio | Solo protege conexiones lentas; Safari no lo expone |

- **Del lado del código:** mover `murcia.css` al chunk de `MurciaExperience` y quitar su modulepreload (`vite.config.ts:190,911`).
- **Choca con:**
  - `decisiones/transicion/precarga-de-murcia.md:23`, que descarta la carga bajo demanda y un estado de carga en la transición;
  - `decisiones/build/js-inicial-de-la-portada.md:41` y el punto 6 de `precarga-de-la-portada.md`;
  - `banda-de-zoom-y-commit.md`: hoy no se confirma el viaje hasta que `murciaReady` es verdadero.

**B. Día, noche y nubes en AVIF en lugar de KTX2: −591 a −786 KB (medido en archivos).**

Calidad medida contra el máster de 4k:

| Archivo | Bytes | PSNR | SSIM |
|---|---:|---:|---:|
| Día actual (ETC1S q128) | 545.086 | 30,70 | 0,907 |
| Día AVIF 4:4:4 crf30 tune=ssim | 279.951 | 36,19 | 0,935 |
| Día AVIF 4:4:4 crf36 | 205.186 | 35,17 | 0,916 |
| Noche actual (ETC1S q128) | 320.156 | 37,30 | 0,968 |
| Noche AVIF 4:4:4 crf34 | 80.219 | 42,24 | 0,978 |

- **A la vista:** con zoom ×4 sobre la costa de Murcia, el ETC1S actual muestra bloques de 4×4 con colores cambiados. El AVIF crf28 es casi el máster, y crf32–36 no tiene bloques aunque ablanda el relieve. Recomendación: día entre crf30 y crf32 (250–280 KB).
- **WebP no sirve:** el día a q80 ocupa 571.712 B.
- **Nubes remapeadas:** una máscara `t = clamp((lin − 0,5) / 0,5)` con `smoothstep(0, 1, t)` en el shader. En AVIF de 2048 a crf50 ocupa 28.046 B, frente a 113.628, con 25,77 dB sobre el resultado del shader (hoy 25,00). Filtrar después del umbral espesa algo las nubes a distancia: la cobertura en los mips sube del 0,86 al 1,18 %. Además resuelve la contradicción sRGB/lineal.
- **Precio: memoria de GPU.**
  - Hoy ETC1S se transcodifica a BC7 en escritorio y a ETC1 en iOS/Android: unos 25 MB en escritorio y unos 12,6 MB en iPad para los tres mapas.
  - Un AVIF sube como RGBA8: 44,7 MB por mapa de 4096 con mips, unos 92 MB en total.
- **Mitigación en iPad:**
  - noche como base RGB de 1024 más las luces en un canal de 4096 con un tinte: 3.489 + 63.728 B, mejor que hoy en todas las métricas (medido), unos 14 MB de GPU;
  - día como luma R8 más croma RG8 a la mitad: unos 16,8 MB (estimado), con el filtrado en gamma.
- **Otros costes:** decodificar 4096×2048 lleva unos 100–200 ms fuera del hilo principal (estimado; `SkyShell` ya lo hace con un ImageBitmap). AVIF exige Safari 16, y el respaldo puede ser el KTX2 actual.
- **Choca con** la razón documentada para usar KTX2 (`earthConfig.ts:20-25`).
- **Esfuerzo:** medio (cargador, `flipY`, precargas). Los másteres ya existen.

**B2. Proyección en cubemap equiangular (EAC, 6×1024²) en lugar de equirectangular.**
- **En KTX2 ETC1S q128** (medido):
  - día: 377.717 B frente a 544.920 (−167 KB);
  - noche: 251.264 B frente a 317.784 (−67 KB);
  - calidad igual por debajo de 60° de latitud, y unos −1,2 a −1,5 dB en los polos.
- **En AVIF:** el día crf32 pasa de 285.481 a 180.535 B y la noche crf40 de 58.497 a 51.191 B. El día en EAC con AVIF queda por encima del ETC1S actual incluso en los polos.
- **Por qué:** en el equirectangular, las franjas por encima de 67,5° son el 7,6 % del área y el 35 % de los bytes del L0 del día.
- **Descartado:** octaédrico de 2560² (peor que EAC), cubemap estándar (necesita más téxeles) y desenfocar los polos en el equirectangular (−10/−18 KB).
- **Esfuerzo:** medio-alto. Requiere `CompressedCubeTexture` o 6 caras AVIF y una búsqueda EAC en el shader. Los cubemaps de WebGL2 filtran sin costuras.
- **Cómo verificar:** vista polar en el zoom cercano.

**C. Transcodificador Basis recortado: −300 a −430 KB (estimado), también en la visita completa.**
- **Situación:** los 47 KTX2 publicados (6 de la Tierra, 1 del satélite y 40 lightmaps) son ETC1S/BasisLZ. El `.wasm` tiene 243.054 B de código y 282.908 de tablas.
- **Propuesta:** compilarlo fuera del repo sin UASTC, HDR, Zstd, ASTC, ATC, PVRTC, FXT1, EAC ni `.basis`, con destinos ETC1, BC1 y RGBA32. Con la API embind intacta, `KTX2Loader` sirve sin cambios.
- **Ajuste necesario:** poner `bptc/pvrtc/astcSupported = false` en `workerConfig` tras `detectSupport` (`src/graphics/decoders.ts:131-137`).
- **Calidad:** el escritorio pasaría de BC7 a BC1. Frente a la decodificación ETC1S (medido):

  | Archivo | BC1 | BC7 |
  |---|---:|---:|
  | día | 48,3 dB | 51,9 dB |
  | noche | 49,7 dB | 57,3 dB |
  | satélite | 42,5 dB | 44,8 dB |
  | `static-NW` | 43,3 dB | 45,7 dB |

  ETC1 sale exacto. El error propio de ETC1S frente al máster ronda los 30 dB, así que el añadido es pequeño, pero hay que mirarlo en la escena. A cambio, la memoria de GPU de esas texturas se reduce a la mitad en escritorio.
- **Posible extra:** compilarlo con `-sDYNAMIC_EXECUTION=0` permitiría quitar `'unsafe-eval'` de la CSP. Sin verificar.
- **Choca con** el punto 3 de `compresion-y-decodificadores.md` (copia exacta del de three) y con la trampa n.º 59. Alternativa: una receta con la versión fijada y un test que transcodifique en Node cada KTX2 publicado; el transcodificador de three ya corre en Node.
- **Riesgo:** medio; un dispositivo que solo tenga PVRTC caería a RGBA32. **Esfuerzo:** 1–2 días más pruebas en dispositivos reales.
- **No se encontró ninguna cifra publicada** de una compilación recortada.
- **Variante:** si la Tierra deja KTX2 por completo (B más la textura del satélite), Basis puede esperar a Murcia. Ahorra 585 KB solo en la visita sin viajar.

**D. Tierra sin R3F y luego Preact: unos −155 y −170 KB (estimado).**
- R3F se usa en 15 archivos y 3.415 líneas (44 `useFrame`, 25 `useThree`, 8 `createPortal`).
- Preact es imposible mientras siga R3F 9.
- Afecta a los dos mundos (`MurciaLayer` es un adaptador de R3F) y al blog.
- Choca con `frontera-de-cada-experiencia.md:10`, con el catálogo de three y con `check:render`.
- Semanas de trabajo, riesgo alto.

### Recortes propios de la Tierra

| # | Qué | Ahorro | Riesgo | Choca con / decisión |
|---|---|---:|---|---|
| E | Logotipos de marca bajo demanda: solo se ven con un satélite seleccionado (`holograma-de-marca.md` §2). El atlas ya actualiza cada celda (`createBrandAtlas.ts:612`) | −134.220 B, medido | Cambio de placa a logo durante el despliegue; se evita precargando con el hover o reteniendo ~300 ms. En táctil no hay hover | `corte-bajo-destello.md` en espíritu |
| F | Satélite simplificado y con las 15 primitivas fusionadas | ~−110 KB, estimado por experimento | Sombreado del plato; revisar en el primer plano | Renombrar el archivo (`recursos-publicados.md` §3) |
| G | Efectos de sonido con el primer gesto o con su intención | −61 a −80 KB, medido | El warp podría no sonar en una red lenta | `efectos-de-sonido.md` §3 y §4 |
| H | Quitar `'Vertigo Switzer'` de `--font-display` (`siteHeader.css:121`) | −43.220 B, medido | Ninguno, comprobado | Decisión del 2026-09-11 de mantener declaradas las fuentes antiguas |
| I | Diálogos de auditoría y contacto en diferido (`App.tsx:860,868`) | −30 a −40 KB, estimado | Bajo; hay que excluirlos en `isPreloadedOnIndex` (trampa n.º 10) | — |
| J | Minificar el GLSL de la app, no solo los comentarios (`stripShaderComments`) | ~−29 KB, estimado | Bajo; compilar y mirar | — |
| K | Subset de General Sans (384 glifos) y Gambetta (354) | −20 a −30 KB, estimado | Glifos raros del CMS | Juego de caracteres admitido |
| L | Stubs de `WebXRManager` y `PMREMGenerator` | −20 a −25 KB, estimado | Frágil: el renderer llama a `xr.*` en cada fotograma | — |
| M | `CasePanel` y `CaseChart` en diferido | ~−17 KB, estimado | Retraso en el primer clic sobre un satélite | — |
| N | Cielo en AVIF de 10 bits crf24 | −67 KB, medido en bytes | Bloques en los oscuros: decidir en escena con grano y dither (`scripts/prepare-sky-panorama.mjs:140-200`) | Calidad del cielo aprobada (`cielo.md`) |
| O | `atMost` de las marcas a 1× con recorte a la tinta (`caseStudies.collection.ts:80`) | ~−27 KB, estimado | Bajo | — |
| P | Efectos en AAC en vez de MP3 de 128 kbps | ~−20 KB, estimado | Hay que escucharlo | — |
| Q | Quitar `SkyShellCube` de producción | −2 a −3 KB, estimado | Ninguno | — |

**F en detalle (medido sobre el GLB).**
- **Contenido:** 58.602 triángulos en 15 primitivas Draco.
- **Dónde se concentra:**
  - `antena.002`: 25.592 triángulos, 63.485 B;
  - `antena.003`: 24.816 triángulos y 60.020 B, para una extensión del 0,7 % de la envergadura. Ocupa 4–8 px de dispositivo en el acercamiento máximo.
- **Simplificación de prueba** (error máximo de 0,5 px en el acercamiento máximo en móvil, sin tocar los bordes de UV): 3.820 y 182 triángulos. Fusionar las primitivas ahorra unos 10 KB de JSON y baja las llamadas de dibujo de 90 a 6.
- **Textura:** a 512 se vería más blanda, porque los paneles ya tienen menos de un téxel por píxel con DPR 2.

**Solo móvil (no cuenta en la visita de escritorio).** Hoy la Tierra en móvil son 268.182 B.
- Nubes estrechas con la receta del mínimo a 120: de 101.174 a 43.844 B, con mejor calidad (22,96 frente a 22,37 dB). Es la mejora más barata del informe.
- En AVIF a 1024 (día 24.031, noche 8.006, nubes 18.001 B), la Tierra móvil quedaría en unos 99 KB con el cielo actual. La memoria de GPU es despreciable.

### Medido y descartado

| Idea | Resultado |
|---|---|
| Meshopt en lugar de Draco | Satélite de ~360–410 KB frente a 172.748; la ciudad crecería 2,0–2,7 MB (estimado). Draco se queda |
| Satélite sin compresión, con `KHR_mesh_quantization` | 1.064.668 B |
| Formatos nativos de GPU sin Basis | BC1 en crudo 12,58 MB; BC1 con Zstd 1.447.747 B (+469 KB) más el decodificador Zstd |
| WASM en línea dentro del JS | +33 % por el base64, y se cuenta igual |
| Compresión HTTP | No cambia `decodedBodySize`. Los 2.380.112 B de JS, CSS y decodificadores pasan a 670.133 B con Brotli |
| Un solo archivo con mips para ancho y estrecho | El L2 del ancho q128 sale 2 dB (día) y 6 dB (noche) peor que el estrecho q180 |
| Nubes horneadas en el día | −5 KB y cambia el crepúsculo |
| Día en KTX2 separado en luma + color | 577 KB, peor |
| Noche con luces en un canal, en KTX2 | 514 KB, peor |
| Nubes procedurales | Ahorro máximo de 28 KB después de B; cambia el aspecto |
| Cielo procedural o a 2048 | Ya rechazados (`cielo.md`, `shell.frag.glsl:150-153`) |
| Textura del satélite a 512 | Más blanda en el primer plano |
| Atlas de marcas precocinado en el build | Ahorro pequeño o negativo; solo ahorra CPU (60–100 ms) |

## Escenarios combinados (estimado)

Visita sin viajar, escritorio, en MB:

| Escenario | Con música | Sin gesto |
|---|---:|---:|
| Hoy (medido) | 9,40 | 8,71 |
| A: Murcia por intención | 4,63 | 3,94 |
| A + recortes E–K | ~4,26 | ~3,57 |
| A + B conservador (sin EAC) + E–K | ~3,6 | ~2,9 |
| A + B + B2 + Basis fuera de la Tierra + E–K | ~2,9 | ~2,2 |

**JS y decodificadores que paga la Tierra:**
- hoy, 2.380.112 B (medido);
- unos 1,95 MB con C, I, J y Q;
- unos 1,70 MB si además Murcia se aplaza;
- unos 1,38 MB con D.

**Visita completa:** aplazar Murcia no ahorra nada. Con la Tierra optimizada en unos 3 MB, incluidos los decodificadores y la música, Murcia tendría que caber en unos 1,5 MB contando su música (0,43 MB). Hoy son 4,77 MB más esa música.

La música de la Tierra (0,67 MB) es el mayor recurso propio que no tiene alternativa técnica. Según el informe anterior, solo bajaría con un bucle más corto, que es una decisión creativa.

## Decisiones pendientes del usuario

1. **Definición del objetivo:** visita sin viajar o visita completa, y con música o sin ella.
2. **Espera o carga por niveles en el primer viaje a Murcia.** Revierte `precarga-de-murcia.md`.
3. **Presupuesto de memoria de GPU** para texturas AVIF, sobre todo en iPad, y la calidad AVIF elegida.
4. **Sustituir la regla de la copia exacta del transcodificador Basis**, y aceptar BC1 en escritorio.
5. **Decisiones menores:** Switzer, logotipos con hover, aspecto del satélite simplificado y qué efecto de sonido puede llegar tarde.

## Hallazgos de paso, sin corregir

- **Espacio de color de las nubes:** los tres archivos de nubes llevan `KHR_DF_TRANSFER_SRGB`, mientras que `EarthScene.tsx:124-127`, `fragment.glsl:37-39`, `earthConfig.ts:52-54` y `convenciones-de-render.md` dicen «lineal».
- **qlevel de día y noche:** el commit `00897d9` dice q180, pero las cabeceras del juego ancho dicen `--qlevel 128`. El estrecho sí es q180, así que tiene más calidad por téxel que el ancho.
- **Satélite en móvil:** `zoomNearFactorNarrow` (`interactionConfig.ts:133-162`) limita el zoom para que los mapas de 1024 no pasen de ×3,6. El primer plano de un satélite (`interactionConfig.ts:190`) llega a unos ×5,4. Sin verificar en la escena; la hoja tapa parte de la pantalla.
- **Flechas de la cabecera:** el comentario de `siteHeader.css:51-53` dice que salen de Switzer. Ni Switzer, ni General Sans, ni Gambetta tienen flechas: salen de una fuente del sistema.
- **Comentarios obsoletos:**
  - `index.html:102`: el juego estrecho es de 1024×512, no de 2048×1024;
  - `index.html:159` (186 KB), `SkyShell.tsx:15` (111 KB) y `spaceConfig.ts:88-91` (q59, 194.642 B): el cielo publicado pesa 96.440 B y el script dice `AVIF_QUALITY = 70`;
  - `SpaceBackdrop.tsx:25,37`: hablan de un zoom fijo y la banda de zoom existe;
  - `interactionConfig.ts:123`: cita un texto que `earthConfig.ts` ya no tiene;
  - `EarthScene.tsx:179`: habla de JPEG.
- **Estrellas en la foto del cielo:** `spaceConfig.ts:75-77` dice que se filtraron las estrellas puntuales, pero un recorte ampliado ×3 del máster y del AVIF publicado muestra puntos estelares. Sin cuantificar.
- **`SkyShellCube`** está en el bundle de producción.
- **Tarea larga en `site`:** en Pixel 7 con la CPU 4× más lenta, la construcción de Murcia produce una tarea larga de unos 1.029 ms.
- **Riesgo latente:** si se arregla la retención de los workers de Basis soltando antes el KTX2 de la Tierra (`EarthScene.tsx:90-97`), los lightmaps crearían un `KTX2Loader` nuevo y volverían a pedir los 584.862 B, porque `KTX2Loader` descarga la biblioteca por instancia. Antes haría falta una caché como `SharedDracoLoader`.
- **Visita repetida:** `decodedBodySize` cuenta también los cuerpos servidos desde la caché, así que la métrica casi no baja aunque la transferencia sea casi nula. Leído en la especificación, sin medir.

## Qué no se verificó

- Ninguna variante se ha probado en la escena ni en un iOS o Android reales.
- Las calidades salen de métricas offline (PSNR, SSIM) y de recortes ampliados.
- Los tiempos de la ciudad son de Chrome sin ventana, no de hardware real.
- Las cifras marcadas como estimadas no están construidas.
