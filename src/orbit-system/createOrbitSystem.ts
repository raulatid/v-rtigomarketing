import * as THREE from 'three'
import { ORBIT_CONFIG, ORBIT_PRESETS, SATELLITES, SatelliteDef } from './orbitConfig'
import { createOrbitLine, OrbitLine } from './createOrbitLine'
import { createSatellite, Satellite } from './createSatellite'
import { createConnectivityCloud } from './createConnectivityCloud'
import { createRadialGlowTexture, easeOutCubic } from './orbitUtils'
import { createBrandAtlas } from './createBrandAtlas'
import { disposeSharedGeometry } from './createHoloPanel'

// Owns the six orbits (lines + head glows + satellites) and the connectivity
// cloud.
//
// The returned group must be added at SCENE level — never under anything that
// rotates with the Earth's surface, or orbital motion compounds with it. It is
// mounted with scale=2 because every preset radius here is in "Earth radius = 1"
// units while our Earth is radius 2 (see orbitConfig.ts).

interface OrbitEntry {
  preset: (typeof ORBIT_PRESETS)[number]
  satelliteDef: SatelliteDef
  orbitLine: OrbitLine
  head: THREE.Sprite
  headMaterial: THREE.SpriteMaterial
  satellite: Satellite
  startDelay: number
  completeTime: number | null
  idleStartTime: number | null
  idleProgress: number
  idleProgressOffset: number
  frozen: boolean
}

interface Options {
  // Forwarded to the satellites' KTX2 baked-texture load (transcoder support
  // detection); satellites render untextured without it.
  renderer?: THREE.WebGLRenderer
}

export function createOrbitSystem({ renderer }: Options) {
  const group = new THREE.Group()
  const glowTexture = createRadialGlowTexture()
  const tmpPoint = new THREE.Vector3()

  // The satellite GLB uses lit materials, and nothing else in the scene is
  // light-responsive (Earth is a shader, lines/sprites are unlit) — so these
  // lights affect only the satellite models.
  // One atlas for all six brand panels — built here rather than per satellite so
  // the six plates share a single texture bind. Uploaded eagerly when a renderer
  // is available, for the same reason the satellite bake is: the first upload of
  // a 2048×1536 texture must not land on the frame the satellites reveal.
  //
  // `logo` is what makes real client artwork appear: the atlas draws its
  // placeholder plate synchronously and swaps in the image if and when it loads,
  // so this stays a synchronous build and a missing logo costs nothing.
  const brandAtlas = createBrandAtlas(
    SATELLITES.map((def) => ({
      name: def.name,
      brandColor: def.brandColor,
      logo: def.logo,
    })),
  )
  if (renderer) renderer.initTexture(brandAtlas.texture)

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
  keyLight.position.set(4, 2, 5)
  group.add(ambientLight, keyLight)

  // One satellite per orbit, paired by array position. Bounded by BOTH lengths:
  // with fewer case studies than presets, `SATELLITES[index]` was undefined and
  // the `.brandColor` read below threw — a throw OrbitSystemLayer converts into
  // a FATAL boot state, so deleting a case study took the entire site down
  // instead of showing one satellite fewer. No effect at today's 6-and-6.
  const pairCount = Math.min(ORBIT_PRESETS.length, SATELLITES.length)
  const orbits: OrbitEntry[] = ORBIT_PRESETS.slice(0, pairCount).map((preset, index) => {
    const orbitLine = createOrbitLine(preset)
    group.add(orbitLine.line)

    const headMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: ORBIT_CONFIG.headGlow.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const head = new THREE.Sprite(headMaterial)
    head.scale.set(ORBIT_CONFIG.headGlow.size, ORBIT_CONFIG.headGlow.size, 1)
    head.visible = false
    group.add(head)

    const satelliteDef = SATELLITES[index]
    const satellite = createSatellite({
      seed: index + 1,
      renderer,
      panel: {
        atlas: brandAtlas,
        index,
        brandColor: satelliteDef.brandColor,
      },
    })
    group.add(satellite.group)

    return {
      preset,
      satelliteDef,
      orbitLine,
      head,
      headMaterial,
      satellite,
      startDelay: ORBIT_CONFIG.orbit.introStartDelay + index * ORBIT_CONFIG.orbit.introStagger,
      completeTime: null,
      idleStartTime: null,
      // Idle progress bookkeeping — lets a satellite be frozen (for a future
      // camera-focus feature) and resume from the exact point it was held at.
      idleProgress: 1,
      idleProgressOffset: 1,
      frozen: false,
    }
  })

  const cloud = createConnectivityCloud()
  group.add(cloud.points)

  function update(delta: number, elapsed: number) {
    cloud.update(delta, elapsed)

    for (const orbit of orbits) {
      const localTime = elapsed - orbit.startDelay
      if (localTime <= 0) continue

      const progress = THREE.MathUtils.clamp(localTime / ORBIT_CONFIG.orbit.introDuration, 0, 1)
      const easedProgress = easeOutCubic(progress)

      if (progress < 1) {
        // Drawing phase: the line grows while a glowing head rides the tip.
        // This is the same visual language as the opening SVG draw, where a dot
        // rides the stroke — the rhyme is intentional.
        orbit.orbitLine.setRevealProgress(easedProgress)
        orbit.orbitLine.curve.getPoint(easedProgress, tmpPoint)
        orbit.head.position.copy(tmpPoint)
        orbit.head.visible = true
        orbit.headMaterial.opacity = ORBIT_CONFIG.headGlow.opacity
        continue
      }

      // Orbit complete: the head fades while the satellite emerges in its place.
      if (orbit.completeTime === null) {
        orbit.completeTime = elapsed
        orbit.orbitLine.setRevealProgress(1)
        orbit.orbitLine.curve.getPoint(1, tmpPoint)
        orbit.head.position.copy(tmpPoint)
        orbit.satellite.group.position.copy(tmpPoint)
        orbit.satellite.group.visible = true
      }

      const sinceComplete = elapsed - orbit.completeTime

      if (orbit.head.visible) {
        const headFade =
          1 - THREE.MathUtils.clamp(sinceComplete / ORBIT_CONFIG.headGlow.fadeOutDuration, 0, 1)
        orbit.headMaterial.opacity = ORBIT_CONFIG.headGlow.opacity * headFade
        if (headFade <= 0) orbit.head.visible = false
      }

      const intro = THREE.MathUtils.clamp(
        sinceComplete / ORBIT_CONFIG.satellite.introDuration,
        0,
        1,
      )
      const easedIntro = easeOutCubic(intro)
      orbit.satellite.setOpacity(easedIntro)
      orbit.satellite.group.scale.setScalar(
        ORBIT_CONFIG.satellite.introScaleStart +
          (1 - ORBIT_CONFIG.satellite.introScaleStart) * easedIntro,
      )

      // Idle orbiting starts only once the entrance completes, from the exact
      // point where the head finished (progress 1.0) — so there is no jump.
      if (intro >= 1) {
        if (orbit.idleStartTime === null) orbit.idleStartTime = elapsed
        if (!orbit.frozen) {
          const idleElapsed = elapsed - orbit.idleStartTime
          orbit.idleProgress = (orbit.idleProgressOffset + idleElapsed * orbit.preset.speed) % 1
          orbit.orbitLine.curve.getPoint(orbit.idleProgress, tmpPoint)
          orbit.satellite.group.position.copy(tmpPoint)
        }
      }

      // The model's self-rotation runs every visible frame — including while
      // frozen behind the case panel — so entering/exiting a case study never
      // interrupts or restarts it. Orientation is never derived from the
      // camera (the old badge billboarding), so camera flights can't reorient
      // the model either.
      if (orbit.satellite.group.visible) {
        orbit.satellite.update(delta)
      }
    }
  }

  // Returns the system to its pre-reveal state so the intro can be replayed.
  function reset() {
    for (const orbit of orbits) {
      orbit.completeTime = null
      orbit.idleStartTime = null
      orbit.idleProgress = 1
      orbit.idleProgressOffset = 1
      orbit.frozen = false
      orbit.orbitLine.setRevealProgress(0)
      orbit.head.visible = false
      orbit.headMaterial.opacity = 0
      orbit.satellite.group.visible = false
      orbit.satellite.group.scale.setScalar(ORBIT_CONFIG.satellite.introScaleStart)
      orbit.satellite.setOpacity(0)
      // Clears the hover bump too — otherwise a replay started while the pointer
      // was over a badge would re-run the entrance on an already-enlarged one.
      orbit.satellite.setHighlight(false)
    }
    cloud.reset()
  }

  // ─── Selection API, for a future satellite-focus feature ───
  function findOrbit(id: string) {
    return orbits.find((o) => o.satelliteDef.id === id) ?? null
  }

  const satelliteHandles = orbits.map((orbit) => ({
    id: orbit.satelliteDef.id,
    data: orbit.satelliteDef,
    object: orbit.satellite.group,
  }))

  // A satellite is selectable only once its entrance finished and it is idling.
  function isSatelliteActive(id: string) {
    const orbit = findOrbit(id)
    return !!orbit && orbit.idleStartTime !== null
  }

  function freezeSatellite(id: string) {
    const orbit = findOrbit(id)
    if (orbit) orbit.frozen = true
  }

  function resumeSatellite(id: string) {
    const orbit = findOrbit(id)
    if (!orbit || !orbit.frozen) return
    orbit.frozen = false
    // Resume from the frozen progress: reset the idle clock so the next frame
    // continues exactly where the satellite was held.
    orbit.idleProgressOffset = orbit.idleProgress
    orbit.idleStartTime = null
  }

  function setSatelliteHighlight(id: string, on: boolean) {
    findOrbit(id)?.satellite.setHighlight(on)
  }

  function dispose() {
    for (const orbit of orbits) {
      orbit.orbitLine.dispose()
      orbit.headMaterial.dispose()
      orbit.satellite.dispose()
    }
    cloud.dispose()
    glowTexture.dispose()
    brandAtlas.dispose()
    ambientLight.dispose()
    keyLight.dispose()
    // Owned here rather than by any single panel, because every panel shares it.
    disposeSharedGeometry()
  }

  return {
    group,
    update,
    reset,
    satellites: satelliteHandles,
    isSatelliteActive,
    freezeSatellite,
    resumeSatellite,
    setSatelliteHighlight,
    dispose,
  }
}

export type OrbitSystem = ReturnType<typeof createOrbitSystem>
