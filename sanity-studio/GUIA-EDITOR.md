# Guía para editar la web de Vertigo

Esta guía es para quien va a cambiar textos, casos de éxito o datos de contacto de la web. No hace falta saber programar.

## Entrar

1. Abre la dirección del editor que te ha dado el equipo técnico.
2. Inicia sesión con tu cuenta (Google o correo, según cómo te dieran de alta).
3. A la izquierda verás el menú **Contenido de la web**.

## Qué hay en el menú

| Sección | Qué es |
|---|---|
| **Casos de éxito** | Las marcas que giran alrededor del planeta. Cada una tiene su ficha, su texto y su gráfico. |
| **Distritos** | Las zonas de la ciudad. Hay una: aquí se edita su texto y qué servicios muestra. |
| **Servicios** | Cada servicio de la agencia, con su nombre y su descripción. Los distritos los muestran. |
| **Blog** | Las entradas del blog. **Todavía no se ven en la web**: se guardan y aparecerán cuando la sección esté lista. |
| **Ajustes del sitio** | Teléfonos, correo de contacto y línea de copyright. |
| **Términos y privacidad** / **Aviso legal** | Los dos documentos legales que enlaza el pie de página. |

## Guardar y publicar

- Todo lo que escribes **se guarda solo**, al momento. No hay botón de guardar.
- Lo que escribes **no está en la web hasta que pulsas «Publicar»** (abajo a la derecha). Hasta entonces es un borrador que solo ves tú.
- Si un campo tiene un error, el botón de publicar no se activa y el campo te dice qué falta. Corrígelo y vuelve a publicar.
- **Los cambios tardan un par de minutos en verse en la web.** Al publicar, la web se reconstruye entera con el contenido nuevo. Si pasados cinco minutos no ves el cambio, avisa al equipo técnico.
- **En el ordenador de desarrollo la web no se actualiza sola.** Quien tenga la web en local tiene que ejecutar `npm run content:build` después de cada publicación; hasta entonces sigue mostrando el contenido anterior. No es un fallo.

## Cosas que conviene saber

**Un caso de éxito nuevo no aparece solo.** Puedes crearlo y rellenarlo entero, pero solo sale en el planeta cuando el equipo técnico le asigna un sitio en la órbita. Avísales cuando esté listo.

**Los distritos no se crean ni se borran.** La ciudad en 3D tiene sus zonas fijas; lo que se edita es el texto de cada una.

**El apartado «Técnico»** que aparece al final de cada documento, plegado, no hace falta tocarlo. Contiene el nombre interno con el que la web reconoce cada elemento; se crea solo y no cambia.

**El gráfico de un caso** se rellena punto a punto: pulsa «Añadir punto» y escribe el valor. Si el gráfico es de barras o donut, cada punto lleva también un nombre (lo que se lee bajo la barra).

**Cada caso lleva dos imágenes de marca**, en PNG o WebP con fondo transparente:

- **Isotipo (símbolo):** solo el símbolo, sin el nombre. Cuadrado, unos 512×512. Es lo que se ve flotando sobre el satélite todo el rato, así que es el más importante de los dos.
- **Logotipo completo:** el símbolo junto al nombre. Apaisado, unos 1024×512. Solo aparece cuando alguien pincha el satélite y se abre la ficha del caso.

**Van los dos o no va ninguno.** Si subes uno y dejas el otro vacío, el editor te lo marca en rojo y la web no se publica. Un caso sin ninguno de los dos sí es válido: se muestra un círculo con el color de la marca y su inicial — no pasa nada.

**Las imágenes** llevan siempre una descripción en una frase (para quien no puede verlas). El editor no te dejará publicar sin ella.

**Teléfonos:** cada uno se escribe dos veces. «Cómo se lee» es con espacios, como en una tarjeta; «cómo se marca» es solo dígitos, seguidos, con el +34 delante.

## Si algo va mal

Nada de lo que hagas aquí puede romper la web: si un contenido tiene un problema, la web simplemente no se actualiza y sigue mostrando la versión anterior. Avisa al equipo técnico con el nombre del documento que estabas editando.
