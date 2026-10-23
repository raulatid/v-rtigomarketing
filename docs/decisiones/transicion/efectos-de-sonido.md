# Efectos de sonido: un clip por momento, en el mismo grafo que la música

**Estado:** vigente · **Desde:** 2026-10-23 · **Sustituye a:** nada

## Decisión

1. **Cada momento tiene un nombre** (`SoundCue` en `src/app/audio/soundEffects.ts`), y cada nombre puede tener un clip en `SOUND_EFFECTS`. Un momento sin entrada no suena y no descarga nada. El comentario de cada `SoundCue` dice cuándo se dispara.
2. **Un único interruptor.** Los efectos cuelgan del mismo maestro que la música (`backgroundMusic.ts`). El interruptor de la cabecera (`SoundToggle.tsx`, «Sonido») los apaga a la vez, y heredan el desbloqueo por gesto y el silencio con el blog abierto o la pestaña oculta ([Música](musica.md)).
3. **Se decodifican, a diferencia de la música.** Un clip de uno o dos segundos ocupa poco en PCM y tiene que empezar en el instante pedido. Se descargan y decodifican en `site`, o al encender el interruptor, nunca antes. Con el interruptor apagado no se descarga ningún efecto.
4. **Llegar tarde es peor que no sonar.** Un momento cuyo clip no está decodificado, o que llega con el sonido silenciado, se descarta; no se pone en cola. También se descartan las repeticiones dentro de `MIN_INTERVAL_SECONDS` y lo que pase de `MAX_VOICES` a la vez.
5. **Los dispara `App.tsx`.** Las experiencias no pueden importar `src/app/` (`check:architecture`), así que avisan por callback y App elige el momento: el warp desde `onStart` y `onCut`, los paneles desde el cambio de su estado (`useSoundCue`), los distritos de Murcia desde `onMurciaAttentionChange` y el acercamiento al blog desde `onBlogApproachStart`.
6. **El golpe del corte sale del propio corte**, no de un desfase desde el inicio. El warp avanza con un reloj por fotogramas que un dispositivo lento estira; el reloj de audio no se estiraría con él.

## Por qué

El cliente quiere sonido en las transiciones. Un segundo interruptor solo para efectos añadiría interfaz sin que nadie lo haya pedido, y un segundo AudioContext duplicaría el desbloqueo y los silencios.

## Qué se descartó

- **Sintetizar los efectos en el navegador:** el cliente aporta los MP3.
- **Sonido en la intro:** antes de `site` no ha habido gesto, así que el navegador lo rechazaría en la primera visita.
- **Bajar la música durante un efecto:** se puede añadir en el bus de música si hace falta al escuchar.

## Se ha roto si…

- Una promesa de `fetch` o `decodeAudioData` queda sin capturar (los recolectores de e2e fallan con rechazos no gestionados).
- Un clip llega a `public/audio/sfx/` sin el hash en el nombre (`/audio/` es `immutable`).
- Un `/blog` en frío pide algo de `/audio/` (`e2e/blog.spec.ts`).
- Falla `soundEffects.test.ts`.

## Afecta a

`src/app/audio/soundEffects.ts`, `src/app/audio/useSoundCue.ts`, `src/app/audio/backgroundMusic.ts`, `src/App.tsx`, `src/components/SoundToggle.tsx`, `public/audio/sfx/`, `CREDITS.md`
