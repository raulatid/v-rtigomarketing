import * as THREE from 'three'
import { ORBIT_CONFIG, ORBIT_PRESETS, SatelliteDef } from './orbitConfig'
import { CASE_STUDIES } from '../../../content/generated/caseStudies'
import { invitedCaseIdFor, orbitAssignmentsFor } from './orbitAssignments'
import { resolveOrbitCases } from './resolveOrbitCases'
import { createOrbitLine, OrbitLine } from './createOrbitLine'
import { createSatellite, Satellite } from './createSatellite'
import { createConnectivityCloud } from './createConnectivityCloud'
import { createRadialGlowTexture, easeOutCubic } from './orbitUtils'
import { createBrandAtlas } from './createBrandAtlas'
import { disposeSharedGeometry } from './createHoloPanel'
import { disposeSharedConeGeometry } from './createEmitterCone'

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
  // Resolved FIRST, because everything below is indexed by it. The atlases, the
  // orbit lines and the satellites are all built by walking `orbitCases` in
  // order, which is what makes "atlas cell index === orbit index" true by
  // construction. The previous code built the atlas from the case list and
  // addressed cells by preset index; those agreed only because both were six
  // items in the same order, and a CMS has no obligation to keep them that way.
  //
  // Throws on a bad assignment rather than dropping one. OrbitSystemLayer turns
  // a throw here into a FATAL boot state, which is the correct outcome: the
  // alternative is a globe quietly showing one client's numbers under another
  // client's name.
  const orbitCases = resolveOrbitCases(ORBIT_PRESETS, orbitAssignmentsFor(CASE_STUDIES), CASE_STUDIES)
  const invitedCaseId = invitedCaseIdFor(CASE_STUDIES)

  // TWO atlases for all six brand panels — the isotype each panel rests on and
  // the logo it unfolds into under selection. Built here rather than per
  // satellite so the six plates of each kind share one texture bind; two binds
  // total, not twelve. Uploaded eagerly when a renderer is available, for the
  // same reason the satellite bake is: the first upload of a multi-megapixel
  // texture must not land on the frame the satellites reveal.
  //
  // `isotype` and `logo` are what make real client artwork appear: each atlas
  // draws its placeholder plate synchronously and swaps in the image if and when
  // it loads, so this stays a synchronous build and missing artwork costs
  // nothing. The content build guarantees the two fields are both set or both
  // null, so a panel never unfolds from a real symbol into a drawn wordmark.
  //
  // One plate list, two atlases. Same array, same order, so cell index means the
  // same thing in both and one `index` addresses a panel's pair.
  const plates = orbitCases.map(({ satellite }) => ({
    name: satellite.name,
    brandColor: satellite.brandColor,
    logo: satellite.logo,
    isotype: satellite.isotype,
  }))
  const isotypeAtlas = createBrandAtlas(plates, 'isotype')
  const logoAtlas = createBrandAtlas(plates, 'logo')
  if (renderer) {
    renderer.initTexture(isotypeAtlas.texture)
    renderer.initTexture(logoAtlas.texture)
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
  keyLight.position.set(4, 2, 5)
  group.add(ambientLight, keyLight)

  // One entry per resolved assignment, in preset order. No index arithmetic
  // across two arrays any more: the pair carries its own preset and its own case
  // study, so there is no way for them to drift apart.
  const orbits: OrbitEntry[] = orbitCases.map(({ preset, satellite: satelliteDef }, index) => {
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

    const satellite = createSatellite({
      seed: index + 1,
      renderer,
      panel: {
        isotypeAtlas,
        logoAtlas,
        index,
        // WHERE THE TWO COLOURS PART. The plates above still carry the case's
        // own `brandColor` — that is the brand's artwork and its fallback mark.
        // The LIGHT the plate hangs in is the site's, one colour for all six,
        // so the projection reads as one piece of hardware showing six clients
        // rather than six differently-tinted effects.
        //
        // `?? satelliteDef.brandColor` is not a safety net: it is the A/B.
        // Setting ORBIT_CONFIG.panel.holoColor to null puts every panel back on
        // its own case's colour, which is exactly what this used to do.
        holoColor: ORBIT_CONFIG.panel.holoColor ?? satelliteDef.brandColor,
      },
      // The hover tutorial's particle cue rides the invited satellite only.
      // Decided here, at construction, so the cue's shader is warmed up with
      // everything else; the focus layer decides WHEN it plays.
      cue: satelliteDef.id === invitedCaseId,
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
      // Snapped, not asked to ease off: the bump is eased now, and a fall left
      // running would be visible under the re-entrance.
      orbit.satellite.resetHighlight()
      orbit.satellite.setInvited(false)
      orbit.satellite.setCue(null)
      // Snaps the brand panel shut, rather than asking it to fold. A reset is a
      // teardown to the pre-intro state: a fold left animating would be visible
      // unfolding backwards underneath the entrance staggering the satellites
      // back in. Same reasoning as the highlight above.
      orbit.satellite.resetExpansion()
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
    hitTarget: orbit.satellite.hitTarget,
    getLogoBottom: orbit.satellite.getLogoBottom,
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

  /** `demo` marks the tutorial as the one asking, which bumps further; see createSatellite. */
  function setSatelliteHighlight(id: string, on: boolean, demo = false) {
    findOrbit(id)?.satellite.setHighlight(on, demo)
  }

  /**
   * Unfolds one satellite's brand panel from its isotype to the full logo.
   *
   * Separate from `setSatelliteHighlight` because the two answer different
   * questions: the highlight is on for hover or the tutorial on unselected
   * satellites, the unfold only for selection. See createSatellite.setExpanded.
   */
  function setSatelliteExpanded(id: string, on: boolean) {
    findOrbit(id)?.satellite.setExpanded(on)
  }

  /** Lights or clears the invitation on one satellite's panel. See createSatellite. */
  function setSatelliteInvited(id: string, on: boolean) {
    findOrbit(id)?.satellite.setInvited(on)
  }

  /**
   * The hover tutorial's particle cue on one satellite: its progress 0..1, or
   * null to hide it. Only the invited satellite carries a cue; on the others
   * this is a no-op, so the caller need not know which.
   */
  function setSatelliteCue(id: string, progress: number | null) {
    findOrbit(id)?.satellite.setCue(progress)
  }

  /** `pixelRatio × CSS viewport height`, for world-sized points. From the layer, on resize. */
  function setViewportScale(px: number) {
    for (const orbit of orbits) orbit.satellite.setViewportScale(px)
  }

  /**
   * How large the satellites are on this viewport, as a factor. See
   * satelliteScale.ts; the layer computes it and pushes it through here on the
   * same effect that carries `setViewportScale`, so there is still exactly one
   * channel from the viewport into this system.
   */
  function setAssemblyScale(factor: number) {
    for (const orbit of orbits) orbit.satellite.setAssemblyScale(factor)
  }

  function dispose() {
    for (const orbit of orbits) {
      orbit.orbitLine.dispose()
      orbit.headMaterial.dispose()
      orbit.satellite.dispose()
    }
    cloud.dispose()
    glowTexture.dispose()
    isotypeAtlas.dispose()
    logoAtlas.dispose()
    ambientLight.dispose()
    keyLight.dispose()
    // Owned here rather than by any single panel, because every panel shares it.
    disposeSharedGeometry()
    disposeSharedConeGeometry()
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
    setSatelliteExpanded,
    setSatelliteInvited,
    setSatelliteCue,
    setViewportScale,
    setAssemblyScale,
    dispose,
  }
}

export type OrbitSystem = ReturnType<typeof createOrbitSystem>
