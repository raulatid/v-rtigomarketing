# La música hace fundido cruzado; la imagen sigue cortando

**Estado:** vigente · **Desde:** 2026-09-11, por indicación del cliente · **Sustituye a:** DECISIONS §48

## Decisión

1. **Cada mundo tiene su bucle de música** (`MUSIC_TRACKS` en `src/app/audio/backgroundMusic.ts`). Earth y Murcia tienen pista.
2. **El warp hace un fundido cruzado entre las dos pistas**, que empieza cuando arranca la cinemática (`onStart`). En el sentido Earth → Murcia eso ocurre después del giro hacia España, no en el commit. Dura `CROSSFADE_SECONDS`, más que el warp, así que la pista nueva se asienta después que la imagen.
3. **Los fundidos usan el reloj del AudioContext**, no `transitionProgress`. Una cinemática confirmada no puede invertirse, así que no hay nada que seguir fotograma a fotograma.
4. **No puede sonar sin un gesto del visitante.** En la fase `site` intenta empezar. Si el navegador lo rechaza, empieza con la primera pulsación, toque o tecla. La rueda y el scroll no cuentan. La cabecera tiene un interruptor, «Sonido» (`SoundToggle.tsx`, WCAG 1.4.2), activo por defecto, guardado como `vertigo:sound`. Apaga también los [efectos de sonido](efectos-de-sonido.md), que cuelgan del mismo maestro.
5. **Se transmite por streaming, no se decodifica.** Cada pista es un `<audio>` conectado a un GainNode: decodificada costaría decenas de MB de PCM, y iOS ignora `element.volume`. Una pista que se funde a silencio se pausa y conserva la posición.
6. **Se apaga** con el blog abierto y con la pestaña oculta. Un `/blog` en frío no tiene ni música ni interruptor.

## Por qué

[Nada hace fundido cruzado](corte-bajo-destello.md) es un principio **visual**. La música es lo único que puede solaparse con el corte.

## Se ha roto si…

- Una promesa de `play()` queda sin capturar (los recolectores de e2e fallan con rechazos no gestionados).
- El listener de desbloqueo se mueve a `pointerdown` o `wheel`, que en táctil no conceden activación de usuario.
- Una pista llega a `public/audio/` sin el hash en el nombre.
- Falla `backgroundMusic.test.ts`, o `e2e/blog.spec.ts` ve un `/blog` en frío pidiendo `/audio/`.

## Afecta a

`src/app/audio/backgroundMusic.ts`, `src/app/useExperienceTransition.ts`, `src/App.tsx`, `src/components/SoundToggle.tsx`, `public/audio/`
