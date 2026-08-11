# Logos de clientes — especificación de entrega

Estos archivos se dibujan dentro del panel holográfico que flota sobre cada
satélite en la escena de la Tierra. Un archivo por caso de éxito, con el mismo
nombre que el `id` del caso en `src/data/caseStudies.ts`:

```
public/logos/satellite-01.webp   →   logo: '/logos/satellite-01.webp'
```

El código hace **contain-fit**: escala el logo hasta que quepa entero dentro de
la celda respetando su proporción, y lo centra. Nunca recorta y nunca deforma.
Cualquier proporción funciona — pero las que se acercan al ideal se ven más
grandes y más nítidas.

---

## Especificación

| Punto | Requisito |
|---|---|
| **Formato** | **WebP** con canal alfa, calidad ≈ 90 o lossless. Pesa 10–40 KB frente a 60–150 KB del PNG equivalente, con calidad idéntica para arte plano. Se aceptan **PNG-24** y **SVG** como alternativa: el cargador es agnóstico al formato. |
| **Dimensiones** | **1600 × 800 px** ideal. Mínimo ~900 px de ancho. Por debajo de eso la imagen se amplía y pierde nitidez en el primer plano del panel de caso. Más grande no es problema. |
| **Proporción** | Entre **2:1 y 4:1** (lockup horizontal). Un símbolo cuadrado funciona, pero se dibuja más pequeño. Un lockup vertical no funciona bien. |
| **Fondo** | **Totalmente transparente.** Sin caja blanca, sin tarjeta redondeada, sin sombra, sin degradado de fondo. Un fondo blanco se renderiza literalmente como un rectángulo blanco — el shader no elimina fondos. |
| **Márgenes** | **Cero.** Recortar ajustado a la caja delimitadora del arte. **El margen lo pone la aplicación.** Un archivo entregado con un 30 % de espacio en blanco incorporado se verá un 30 % más pequeño que sus vecinos, y no hay forma de detectarlo automáticamente. Este es el punto que más se incumple. |
| **Color** | **A todo color**, los colores originales de marca — no una versión monocroma. |
| **Variante** | La versión **para fondo oscuro** ("reverse" / "knockout") que indiquen sus normas de marca. |

---

## Por qué la variante para fondo oscuro

El panel es una superficie holográfica oscura sobre el espacio. Un logo negro o
azul marino muy oscuro desaparece: no se ve mal, no se ve en absoluto. Casi
todos los manuales de marca incluyen ya una versión para fondo oscuro (símbolo a
color + logotipo en blanco o claro) — es ese archivo el que hay que pedir, por su
nombre.

Si una marca solo dispone de versión oscura, hay tres salidas, y se eligen caso
por caso porque recolorear una marca registrada es una decisión de marca, no de
render:

1. Versión en blanco del símbolo (aplanar a `#fff` conservando el alfa). Casi
   siempre permitido como "monocromo reverse", y la opción más segura.
2. Mantener el color y añadir una placa clara detrás. No recomendado: pelea con
   el lenguaje holográfico y parece una pegatina.
3. Dejar la placa generada que ya existe, que es el comportamiento por defecto.

---

## Notas sobre SVG

Se acepta, pero conviene entregarlo además en WebP o PNG, porque un SVG dentro de
un `<canvas>` tiene tres trampas:

- Necesita atributos **`width` y `height` explícitos**. Solo con `viewBox` el
  navegador no le asigna tamaño intrínseco y no se dibuja nada. La aplicación
  detecta este caso, avisa por consola y conserva la placa generada.
- Un SVG cargado como imagen **no resuelve referencias externas**: ni CSS
  externo, ni `@font-face`, ni imágenes enlazadas. **Todo el texto debe estar
  convertido a trazados**, o se renderiza con otra tipografía o directamente no
  se renderiza. Es el fallo más habitual.
- El soporte de `filter` y `mask` varía entre navegadores.

---

## Cuando esto venga de WordPress

El campo `logo` es una URL. Hoy apunta a `/logos/…`, mañana apuntará a la
biblioteca de medios de WordPress, y **no cambia nada más en el código**. Dos
cosas que sí habrá que resolver en el servidor:

- El origen de WordPress debe enviar `Access-Control-Allow-Origin` en la ruta de
  `wp-content/uploads/` (no lo hace por defecto). Sin esa cabecera, el navegador
  no permite usar la imagen como textura WebGL y la aplicación conserva la placa
  generada. Conviene confirmarlo con el hosting antes de empezar.
- Añadir el origen a `img-src` y `connect-src` en la CSP de `vercel.json`.

La alternativa más robusta es un rewrite en Vercel que sirva el CMS bajo el mismo
dominio: elimina el problema de CORS por completo y deja la CSP intacta.

---

## Verificación rápida

1. Copiar el archivo en esta carpeta.
2. Poner la ruta en el campo `logo` del caso en `src/data/caseStudies.ts`.
3. `npm run dev`, dejar correr la intro hasta que aparezcan los satélites.

Si el logo no aparece, la consola dice por qué: tamaño intrínseco ausente, CORS,
o resolución baja.
