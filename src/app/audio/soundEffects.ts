/**
 * The sound effects engine: short clips, one per cue, played on request. It
 * knows no cue names — those, their clips and which ones cover others are the
 * site's catalog (soundCues.ts), handed to `createSoundEffects`.
 *
 * ── Decoded, unlike the music ──
 *
 * The music streams because three minutes of PCM would not fit the phone
 * budget. An effect is a second or two, a few hundred KB decoded, and has to
 * start on the sample it is asked for — so each one is fetched and decoded
 * once into an `AudioBuffer` and played through a fresh `AudioBufferSourceNode`.
 *
 * ── It shares the music's output ──
 *
 * The effects bus hangs off the same master gain as the music's
 * (audioOutput.ts), so the header's one toggle, the gesture unlock, the blog
 * and a hidden tab silence both alike. Nothing here creates an AudioContext of
 * its own.
 *
 * ── Late is worse than none ──
 *
 * A cue whose clip is not decoded yet is dropped, not queued: a whoosh that
 * lands after its warp is a bug. Every clip starts decoding the moment the
 * graph exists, whichever call made it (`onSoundContext`).
 *
 * ── One transition, one sound ──
 *
 * Cues asked for in the same task are played together at its end, after the
 * catalog's masks have had their say: opening the audit from a case also
 * deselects the case in the same render, and that is heard as the audit
 * opening alone. A microtask is far inside what an ear can place.
 */
import { effectsOutput, onSoundContext } from './audioOutput'

export interface SoundEffect {
  /** `/audio/sfx/<cue>-<sha8>.mp3`, hand-hashed like the music (CREDITS.md). */
  src: string
  /** 0..1, on top of `EFFECTS_VOLUME`. Defaults to 1. */
  volume?: number
  /** The least time between two starts of this cue. Defaults to
   *  `MIN_INTERVAL_SECONDS`. */
  minIntervalSeconds?: number
}

/** Which cues each cue silences when both are asked for in the same task. */
export type CueMasks<C extends string> = Readonly<Partial<Record<C, readonly C[]>>>

export interface SoundEffectsConfig<C extends string> {
  /** The clips. A cue without an entry is silent and nothing is fetched for it. */
  effects: Readonly<Partial<Record<C, SoundEffect>>>
  /** Moments that land together as one transition. A mask holds whether or not
   *  the masking cue has a clip: it is about the moment, not the file. */
  masks?: CueMasks<NoInfer<C>>
}

/** What the engine plays into: audioOutput.ts, or a fake under test. */
export interface EffectsOutput {
  effectsOutput(): { ctx: AudioContext; bus: GainNode } | null
  onSoundContext(listener: (ctx: AudioContext) => void): () => void
}

/** Enough to swallow a double fire from two paths reaching the same moment,
 *  short of anything a visitor could do on purpose. */
export const MIN_INTERVAL_SECONDS = 0.08
/** Overlapping effects past this many are dropped, not mixed into mud. */
export const MAX_VOICES = 4

/** Whether a cue may start now. Pure, so it is the part under test. */
export function admitSound(
  lastStartedAt: number | undefined,
  now: number,
  minIntervalSeconds: number,
  voices: number,
): boolean {
  if (voices >= MAX_VOICES) return false
  return lastStartedAt === undefined || now - lastStartedAt >= minIntervalSeconds
}

/** The cues of one task that are heard: each once, in order of asking, less
 *  any another of them masks. Pure. */
export function resolveCues<C extends string>(requested: readonly C[], masks: CueMasks<C>): C[] {
  const asked = [...new Set(requested)]
  return asked.filter((cue) => !asked.some((other) => other !== cue && masks[other]?.includes(cue)))
}

type Clip =
  | { status: 'loading' }
  | { status: 'ready'; buffer: AudioBuffer }
  | { status: 'failed' }

/**
 * An engine for one catalog. Starts decoding every listed clip as soon as the
 * output has a context, and returns `play`, which plays a cue at the end of the
 * current task or drops it: unlisted, masked, silenced, not decoded yet, too
 * soon after itself, or too many already sounding.
 */
export function createSoundEffects<C extends string>(
  { effects, masks = {} as CueMasks<C> }: SoundEffectsConfig<C>,
  output: EffectsOutput = { effectsOutput, onSoundContext },
): (cue: C) => void {
  const clips = new Map<C, Clip>()
  const lastStartedAt = new Map<C, number>()
  let voices = 0
  let pending: C[] = []

  function load(cue: C, effect: SoundEffect, ctx: AudioContext): Clip {
    const existing = clips.get(cue)
    if (existing) return existing
    const loading: Clip = { status: 'loading' }
    clips.set(cue, loading)
    fetch(effect.src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        clips.set(cue, { status: 'ready', buffer })
      })
      .catch((error: unknown) => {
        // Not retried: a clip that 404s or will not decode does so every time,
        // and the cue going silent is the whole of the damage.
        clips.set(cue, { status: 'failed' })
        console.warn(`[sound] could not load ${effect.src}`, error)
      })
    return loading
  }

  function start(cue: C) {
    const effect = effects[cue]
    if (!effect) return
    const out = output.effectsOutput()
    if (!out) return
    const clip = load(cue, effect, out.ctx)
    if (clip.status !== 'ready') return

    const { ctx, bus } = out
    const now = ctx.currentTime
    const interval = effect.minIntervalSeconds ?? MIN_INTERVAL_SECONDS
    if (!admitSound(lastStartedAt.get(cue), now, interval, voices)) return
    lastStartedAt.set(cue, now)

    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    const gain = ctx.createGain()
    gain.gain.value = effect.volume ?? 1
    source.connect(gain)
    gain.connect(bus)
    voices++
    source.onended = () => {
      voices--
      source.disconnect()
      gain.disconnect()
    }
    source.start()
  }

  function flush() {
    const heard = resolveCues(pending, masks)
    pending = []
    for (const cue of heard) start(cue)
  }

  // With the toggle off there is no graph, so no effect costs a byte.
  output.onSoundContext((ctx) => {
    for (const [cue, effect] of Object.entries(effects) as [C, SoundEffect][]) {
      load(cue, effect, ctx)
    }
  })

  return (cue) => {
    if (pending.length === 0) queueMicrotask(flush)
    pending.push(cue)
  }
}
