# Tierra: alternativas a cómo se preparan los assets y se dibuja la escena

**Fecha:** 2026-11-20 · **Base:** `fd36f6b` · **Continúa:** el [informe de peso de la Tierra del 2026-11-18](project-resource-budget-earth-2026-11-18.md) y aplica a la Tierra la lente de las [alternativas de luz y geometría de Murcia](murcia-light-and-geometry-alternatives-2026-11-20.md)
**Guía:** ninguna; es un análisis a petición, no una pasada de `audits/website-performance-and-optimization.md`

Pregunta: ¿qué se puede optimizar en la escena de la Tierra, o definir de otra manera, en todo el recorrido desde los másteres (texturas y `.blend` del satélite) hasta la escena en web? El informe del 2026-11-18 ya cubre los bytes de descarga; este busca lo que aquel no trata: la cadena de preparación, la memoria de GPU, el coste de dibujo y la CPU.

**No se ha generado, medido ni visto nada nuevo.** Las cifras medidas son de informes anteriores y llevan su fuente. Lo demás es lectura de código o aritmética. No se modificó código, ningún archivo de `04_Assets` ni ninguna `.blend`, y no se abrió Blender.

**Etiquetas.** *Medido*: cifra de un informe anterior, con su fuente. *Leído*: código. *Estimado*: aritmética o juicio sin construir la variante. *Sin medir*: ni siquiera se conoce el signo.

---

## 1. Resumen

- **Estas propuestas ahorran sobre todo memoria de GPU, tiempo de GPU y CPU, no bytes.** Los ahorros de descarga de la Tierra siguen siendo los del informe del 2026-11-18. De este informe, solo el satélite añade bytes (≈ −110 KB, que ya es su punto F).
- **La Tierra no tiene una cadena reproducible** como Murcia. Es el requisito previo para probar con seguridad cualquier cambio de formato (§3).
- **El satélite es lo único que viene de Blender y no sigue el criterio de Murcia:** geometría invisible, iluminación duplicada, dos soles distintos y 90 llamadas de dibujo (§4).
- **La memoria de GPU de la Tierra en iPad está en los targets del postproceso y en el cielo, no en los mapas del globo:** unos 215 MB en reposo, de los que solo 12,6 MB son los mapas (§5). Liberar entre 90 y 180 MB haría viable el AVIF del globo (punto B del informe del 2026-11-18), que cuesta entre +45 y +67 MB.
- **El bloom corre en reposo a toda la resolución** y obliga a la Tierra a ir por el composer sin MSAA, mientras el framebuffer MSAA del canvas está reservado y sin usar (§6).
- Lo que ya está bien: la luz del globo, la atmósfera y las estrellas se calculan en el cliente y la UV del globo es implícita. Las dos ideas grandes de Murcia (no enviar la luz, no enviar la UV) ya están aplicadas en el globo.

Nada de esto está aplicado.

---

## 2. Punto de partida

- **Globo** (*leído*, `EarthScene.tsx`, `shaders/earth/`): `SphereGeometry` de 64×64, `ShaderMaterial` que mezcla día y noche por `dot(uSunDirection, normal)`, nubes por umbral `smoothstep(0.5, 1.0, .r)` y fresnel de atmósfera. La atmósfera es otra esfera de 64×64 a escala 1,04, `BackSide` y transparente. El sol es fijo: `sunAzimuth` 0,5 y `sunElevation` 0 (`earthConfig.ts:10-11`), es decir, `uSunDirection` ≈ (0,48, 0, 0,88).
- **Mapas** (*medido*, informe del 2026-11-18): KTX2 ETC1S, día y noche de 4096×2048 a q128 y nubes de 2048×1024; unos 25 MB de GPU en escritorio (BC7) y 12,6 MB en iPad (ETC1).
- **Cielo** (*leído*, `SkyShell.tsx`, `spaceConfig.ts`): AVIF de 4096×2049 (96.440 B, *medido*) subido como RGBA8 sin mips: **33,6 MB de GPU**. La versión estrecha (2048×1025) son unos 8,4 MB.
- **Estrellas:** 3.500 de fondo y 2.000 de la intro (`introConfig.ts:245,265`), procedurales.
- **Satélite** (*leído*, `createSatellite.ts`, `createOrbitSystem.ts:93-96`): una plantilla GLB clonada 6 veces con los materiales clonados (cada uno se funde por separado). `MeshStandardMaterial` con `metalness = 0`, `roughness = 1` y el mapa horneado, más una `AmbientLight` de 1,0 y una `DirectionalLight` de 1,8 en (4, 2, 5).
- **Satélite, geometría** (*medido*, informe del 2026-11-18 §F y `04_Assets/optimizados/recodificacion-2026-11-18/LEEME.md`): 58.602 triángulos en 15 primitivas Draco (172.748 B). `antena.002` y `antena.003` suman 50.408 triángulos para un 0,7 % de la envergadura, 4–8 px en el acercamiento máximo. Hay 9.138 triángulos de área cero en el origen.
- **Atlas de marcas** (*leído*, `createBrandAtlas.ts`; *medido* en `ios-safari-2026-08-14.md`): 2048×1536 con mips, unos 16,8 MB de GPU. Se dibuja en el cliente.
- **Postproceso** (*leído*, `RenderPipeline.tsx`): la Tierra va siempre por el composer: `RenderPass` → `UnrealBloomPass` → `AfterimagePass` → vacío → `OutputPass`. Todos los targets son HalfFloat sin MSAA y escalados por el DPR (`composer.setPixelRatio`). `bloomStrength` es 0,55 en reposo (`introConfig.ts:282`), así que el bloom está activo. El afterimage y el vacío se desactivan a 0, pero sus targets siguen reservados: `AfterimagePass` los crea en el constructor (`node_modules/three/examples/jsm/postprocessing/AfterimagePass.js:25,30`).
- **Canvas:** `antialias: true` y `dpr={[1, 2]}` (`SceneCanvas.tsx:260-262`). El límite de DPR 2 en móvil es decisión del usuario (`configuracion-del-renderer.md`) y aquí no se cuestiona.

---

## 3. La Tierra no tiene cadena, tiene archivos sueltos

**Qué pasa hoy** (*leído*):

| Asset | De dónde sale | ¿Reproducible? |
|---|---|---|
| Día y noche, ancho y estrecho | `04_Assets/texturas-tierra/*-4k.jpg` y `*-1k.jpg` con órdenes `toktx` manuales | No. `prepare-earth-textures.mjs` no los produce (`convenciones-de-render.md` §5) |
| Nubes anchas | `fair_clouds_4k.jpg`, receta del 2026-11-18 | Sí, byte a byte |
| Cielo | origen desconocido; 4096×2049 | No: no salió de `prepare-sky-panorama.mjs` (`cielo.md` §2) |
| Satélite | `02_Identidad de Marca/Blender/satelite.blend` → export manual de junio (`03_UX-UI/satelite_bueno.glb`) → recodificación Draco del 2026-11-18 | Solo el último paso |
| Textura del satélite | `04_Assets/satellite_Baked.png`, horneado manual → receta del 2026-11-18 | Solo el último paso |

**Incoherencias que ya ha producido** (*medido*, `LEEME.md` de la receta del 2026-11-18):
- El commit `00897d9` dice q180 para día y noche, y los archivos llevan q128.
- Las nubes están etiquetadas sRGB en el DFD, mientras que `EarthScene.tsx`, `fragment.glsl`, `earthConfig.ts` y `convenciones-de-render.md` dicen «lineal».

**Propuesta.** Una receta única `earth/` en `04_Assets`, al estilo de `murcia-v8/`: de los másteres a los archivos de `public/`, con `sha256` de lo publicado y controles automáticos:
- PSNR contra el máster por nivel de mip;
- espacio de color declarado frente al esperado;
- dimensiones múltiplo de 4, orientación abajo-izquierda y mips;
- memoria de GPU de cada textura tras la transcodificación, por destino (BC7, BC1, ETC1).

Para el satélite, un script de export desde la `.blend` (limpieza, decimado de antenas y export glTF) seguido de la recodificación Draco que ya existe.

**Ahorro:** 0 bytes. Es el requisito para probar AVIF, EAC o el cielo en KTX2 (§5) sin repetir estas incoherencias. **Riesgo:** bajo. **Esfuerzo:** bajo-medio.

---

## 4. Satélite: rehacerlo con el criterio de Murcia

### 4.1 Geometría

- Decimar las antenas y eliminar los triángulos de área cero **en la `.blend`, antes de exportar**, no en el posproceso.
- La simplificación de prueba del informe del 2026-11-18 (error máximo de 0,5 px en el acercamiento máximo en móvil, sin tocar bordes de UV) dejó las antenas en 3.820 y 182 triángulos. Fusionar las 15 primitivas ahorra además unos 10 KB de JSON.
- **Ahorro:** ≈ −110 KB de red (*medido* por experimento, informe del 2026-11-18 §F). Triángulos por fotograma con los 6 satélites: de unos 352.000 a unos 73.000 (*estimado*: 3.820 + 182 + 8.194 del resto, por 6; puede bajar más si los triángulos de área cero están en ese resto).
- **Riesgo:** el sombreado del plato; revisar en el primer plano.
- **Choca con:** renombrar el archivo (`recursos-publicados.md` §3).

### 4.2 Llamadas de dibujo

- Hoy: 6 satélites × 15 primitivas = **90** (*leído*).
- Con las primitivas fusionadas: **6**.
- Con un `InstancedMesh` y el fundido y el resalte como atributos por instancia, en vez de materiales clonados: **1**. Exige rehacer `applyHighlight` y el fundido de entrada de `createSatellite.ts`.

### 4.3 Iluminación

- **Hoy se ilumina dos veces:** la textura horneada «es dueña de su sombreado» (`convenciones-de-render.md` §1), pero el material es PBR y recibe una luz ambiental y una direccional.
- **Hay dos soles:** la Tierra usa (0,48, 0, 0,88) y la luz del satélite apunta desde (0,60, 0,30, 0,75), unos 20° de diferencia (*estimado*). El satélite no se ilumina como el globo que tiene debajo.
- **Alternativa:** hornear solo albedo y AO, y calcular un único N·L barato con el `uSunDirection` de la Tierra (un `MeshLambertMaterial` o un `onBeforeCompile`). Desaparecen las dos luces y el shader PBR.
- **No conviene el unlit puro de Murcia:** el satélite gira con su `spinner` y la luz horneada giraría con él.
- **Ahorro:** 0 bytes. Las normales se quedan, porque N·L las necesita. Se gana coste de fragmento y coherencia visual.
- **Riesgo:** cambia el aspecto; hay que verlo en la escena.

---

## 5. Memoria de GPU: dónde está de verdad

### 5.1 Reparto en reposo (*estimado*)

Supuesto: iPad Air en horizontal, 1180×820 CSS a DPR 2 = 2360×1640 ≈ 3,87 Mpx. Recibe el juego ancho de texturas. Un target HalfFloat ocupa 8 B/px. La cadena del bloom suma el target brillante a media resolución más 5 niveles de mip horizontales y verticales: ≈ 0,92 de la resolución completa.

| Recurso | Memoria |
|---|---:|
| Mapas del globo (ETC1) | 12,6 MB |
| Cielo (RGBA8 de 4096×2049, sin mips) | 33,6 MB |
| Atlas de marcas (2048×1536 con mips) | 16,8 MB |
| Composer: 2 targets a resolución completa | 62 MB |
| Afterimage: 2 targets, reservados aunque el pase esté desactivado | 62 MB |
| Cadena del bloom | ~28 MB |
| **Total** | **≈ 215 MB** |

A eso se suman Murcia, que sigue montada (`ios-safari-2026-08-14.md`: «Peak VRAM holds both worlds»), y el framebuffer MSAA del canvas.

En escritorio a 1440×900 y DPR 2 (5,18 Mpx), cada target HalfFloat son unos 41 MB, así que los ahorros de §5.2 y §6 son proporcionalmente mayores; allí la memoria aprieta menos.

### 5.2 Propuestas

**A. Targets del afterimage solo durante el warp: ≈ −62 MB en iPad (*estimado*).**
- El pase solo se usa unos 1,6 s por warp. Se crean al detectar la intención de viaje y se liberan después.
- **Riesgo:** reservar en mitad del warp puede dar un tirón. Hay que reservarlos con antelación y comprobarlo en un dispositivo real.
- **Toca:** `RenderPipeline.tsx` y `el-pipeline-dibuja-un-contrato.md`.

**B. Cielo en KTX2: ≈ −25 MB en escritorio y −29 MB en iPad (*estimado*).**
- BC7 sin mips: 1 B/téxel = 8,4 MB. ETC1: 0,5 B/téxel = 4,2 MB.
- **Bytes: sin medir.** Un cielo oscuro con grano puede pesar más en ETC1S que los 96 KB del AVIF actual.
- **Riesgo:** bandas en los oscuros; el shader ya añade grano y dither por eso (`cielo.md` §5).
- **Choca con:** `cielo.md` §2 (las imágenes publicadas «son las buenas»). Habría que recodificarlas desde ellas.

**C. Logotipos bajo demanda** (punto E del informe del 2026-11-18): −134.220 B de red (*medido*), pero **no ahorra memoria** mientras el atlas mantenga su tamaño de 2048×1536.

### 5.3 Por qué importa

El AVIF del globo (punto B del informe del 2026-11-18) ahorra entre −0,59 y −0,79 MB de red a cambio de entre +45 y +67 MB de GPU, y esa memoria es lo que lo frenaba en iPad. Con A y B de este apartado (≈ −91 MB), y más aún con §6 (≈ −180 MB en total), el AVIF del globo cabe sin pasar del reparto de hoy.

---

## 6. Bloom y composer en reposo

**Qué pasa hoy** (*leído*):
- Con `bloomStrength` a 0,55, `UnrealBloomPass` corre en cada fotograma: unas 13 pasadas, la mayoría a resolución reducida, que equivalen a unas 2 pasadas completas. Se suman el `RenderPass` y el `OutputPass` en HalfFloat a pantalla completa.
- La Tierra se dibuja en targets sin MSAA, así que el `antialias: true` del canvas no le sirve. El framebuffer MSAA se reserva y se paga igual.

**Alternativa.** Poner el halo dentro de los propios materiales aditivos (atmósfera, paneles holográficos, conos emisores, señal de hover) y dibujar la Tierra por la ruta directa, como Murcia. El composer solo se usaría durante el warp, igual que hoy lo toma prestado Murcia (`direct-composited`).
- **Ahorro:** unas 15 pasadas a pantalla completa menos por fotograma en reposo (*estimado*). Hasta ≈ −90 MB más en iPad si los targets del composer y del bloom se liberan fuera del warp (*estimado*: 62 + 28).
- **Calidad:** la Tierra recupera MSAA en las órbitas, los satélites y el borde del globo.

**Riesgo.**
- Cambia el brillo. **No se ha comprobado qué elementos superan hoy el umbral de 0,62;** hay que mirarlo en la escena antes de decidir.
- Las estrellas que hoy florecen con el bloom tendrían que llevar su halo en `starShader.ts`.
- Reservar los targets justo antes del warp tiene el mismo riesgo de tirón que en §5.2 A.

**Choca con:** `el-pipeline-dibuja-un-contrato.md` (§3: la Tierra va por el composer), `cielo.md` §7 y `trampas/earth.md` n.º 21. `e2e/backdrop.spec.ts` cambiaría de píxeles.

**Paso intermedio ya documentado:** un solo desenfoque del bloom con el radio por uniform en vez de 5 variantes de `KERNEL_RADIUS` (plan `mejoras-2026-10/12-three-y-fluidez.md`, propuesta 4). Son 4 programas menos que compilar en el arranque; no está medido aparte.

---

## 7. CPU: el atlas de marcas

- **Hoy** (*medido* con la CPU 4× más lenta, plan `mejoras-2026-10/12-three-y-fluidez.md` §2): `drawLockup`/`drawMark` 45 ms, `inkBounds` + `getImageData` 76 ms, decodificación de PNG 50 ms y GC 8 ms.
- **Propuesta:** calcular `inkBounds` en `content:build`, porque los márgenes son fijos por logotipo. **≈ −76 ms** con la CPU 4× más lenta. El atlas entero precocinado en el build ahorra 60–100 ms, pero sus bytes salen iguales o peores (informe del 2026-11-18, «Medido y descartado»).

---

## 8. Resumen de ahorros

| Propuesta | Bytes de red | Memoria de GPU (iPad) | Otro ahorro |
|---|---:|---:|---|
| §3 Receta reproducible | 0 | 0 | Hace seguras las demás |
| §4.1 Satélite simplificado y fusionado | ≈ −110 KB (*medido* por experimento) | pequeño | ~352.000 → ~73.000 triángulos por fotograma (*estimado*) |
| §4.2 Satélite fusionado e instanciado | 0 | pequeño | Llamadas de dibujo: 90 → 6 → 1 |
| §4.3 Un solo sol analítico | 0 | 0 | Dos luces y el PBR menos; coherencia con el globo |
| §5.2 A Afterimage solo en el warp | 0 | ≈ −62 MB (*estimado*) | — |
| §5.2 B Cielo en KTX2 | *sin medir*, posible aumento | ≈ −29 MB (*estimado*) | — |
| §5.2 C Logotipos bajo demanda | −134 KB (*medido*) | 0 | — |
| §6 Bloom en los shaders, composer solo en el warp | 0 | hasta ≈ −90 MB (*estimado*) | ~15 pasadas menos por fotograma; MSAA |
| §6 Un solo desenfoque por uniform | 0 | 0 | 4 programas menos al arrancar |
| §7 Márgenes del atlas en el build | 0 | 0 | ≈ −76 ms con la CPU 4× más lenta (*medido*) |

Memoria en reposo en iPad (*estimado*): unos 215 MB hoy; unos 124 MB con §5.2 A y B; unos 35 MB añadiendo §6 con los targets liberados.

**Comparado con las palancas grandes del informe del 2026-11-18:**

| Palanca | Ahorro |
|---|---:|
| A. Murcia por intención | −4,77 MB sin viajar; 0 en la visita completa |
| B. Día, noche y nubes en AVIF | −0,59 a −0,79 MB, a cambio de +45 a +67 MB de GPU |
| C. Basis recortado | −0,30 a −0,43 MB, también en la visita completa |

---

## 9. Descartado en este análisis

| Opción | Por qué |
|---|---|
| Satélite unlit puro, como Murcia | Gira con su `spinner`: la luz horneada giraría con él |
| Quitar las normales del satélite | El N·L de §4.3 las necesita |
| Bajar el DPR de la Tierra | Decisión del usuario del 2026-10-20 (`configuracion-del-renderer.md`) |
| Targets del composer en `UnsignedByte` | Recortaría los valores > 1 antes del tone mapping del `OutputPass`: cambia el bloom y los aditivos. No se descarta del todo, pero §6 lo hace innecesario |
| Herencia de luz o UV implícita en el globo | Ya lo son: la luz del globo se calcula en el cliente y su UV sale de la esfera |

---

## 10. Orden propuesto

1. **Receta reproducible** de texturas y satélite (§3).
2. **Satélite rehecho desde la `.blend`** (§4): limpieza, decimado, fusión, instanciado y sol único.
3. **Memoria:** afterimage solo en el warp (§5.2 A) y medición del cielo en KTX2 (§5.2 B).
4. **Bloom dentro de los shaders** frente a la versión actual, lado a lado en la escena (§6).
5. **Texturas del globo** (B y B2 del informe del 2026-11-18), una vez fijado el presupuesto de memoria.

### Lo primero que hay que medir

- Los bytes del cielo en KTX2 ETC1S y UASTC, y su aspecto en los oscuros.
- La memoria real de GPU en un iPad en reposo en la Tierra. Las cifras de §5 son aritmética.
- Qué elementos superan el umbral del bloom en reposo.

## Decisiones abiertas

1. Si el satélite puede iluminarse con un sol analítico, el mismo de la Tierra.
2. Si la Tierra puede dejar el composer fuera del warp. Revierte parte de `el-pipeline-dibuja-un-contrato.md`.
3. Cuánta memoria de GPU se da al iPad: decide si entra el AVIF del globo.
4. Murcia por intención, pendiente desde el informe del 2026-11-18.

---

## Cómo se obtuvo

- Se leyeron el informe de peso de la Tierra del 2026-11-18, las alternativas de Murcia y la cadena v8 del 2026-11-20, `ios-safari-2026-08-14.md`, el plan `mejoras-2026-10/12-three-y-fluidez.md`, `04_Assets/optimizados/recodificacion-2026-11-18/LEEME.md` y las decisiones `convenciones-de-render.md`, `cielo.md`, `satelites.md` y `el-pipeline-dibuja-un-contrato.md`.
- Código leído: `EarthScene.tsx`, `shaders/earth/` y `shaders/atmosphere/`, `SkyShell.tsx`, `spaceConfig.ts`, `introConfig.ts`, `earthConfig.ts`, `createSatellite.ts`, `createOrbitSystem.ts`, `createBrandAtlas.ts`, `RenderPipeline.tsx`, `vacuumPass.ts`, `SceneCanvas.tsx` y, en three 0.174, `AfterimagePass.js` y `UnrealBloomPass.js`.
- Se localizaron las fuentes del satélite en `02_Identidad de Marca/Blender/` y `03_UX-UI/` por nombre de archivo. No se abrieron.
- La memoria sale de la resolución supuesta, el DPR y los bytes por téxel de cada formato. Los triángulos del satélite, de las cifras medidas del informe del 2026-11-18.

No se ejecutaron tests ni harnesses durante el análisis, ni se miró la escena en el navegador.
