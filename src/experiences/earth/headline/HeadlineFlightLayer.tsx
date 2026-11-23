import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EARTH_CONFIG } from '../config/earthConfig'
import type { SequenceState } from '../config/sequenceState'
import { atOrAfter, orbitsVisible } from '../config/sceneVisibility'
import { clampFrameDelta } from '../../../graphics/frameDelta'
import { clamp01 } from '../../../utils/easing'
import { prefersReducedMotion } from '../../../platform/motionPreference'
import {
  HEADLINE_FLIGHT,
  type RingFrame,
  fadeIn,
  flightDuration,
  letterAngle,
  letterLag,
  liftAmount,
  orbitRadius,
  planetCover,
  ringFrame,
  ringPoint,
  ringTurn,
} from './headlineFlight'

/**
 * The h1's letters, flown in on a wide orbit (block 9, I3; in production since I4).
 *
 * Mounted last in EarthExperience. The h1 stays App's (HomeHeadline): one real
 * heading, untouched, that a reader names from the first commit. This adds a
 * layer of loose letters inside `.home-headline`, `aria-hidden`, and marks the
 * block with `data-flight` so its stylesheet hides the real title and the line
 * while they fly. When the last letter sits on its glyph the layer goes and the
 * real title is back in the same frame; the line fades in after it.
 *
 * Found by its class, like HintLayer's `.earth-hint`, so the entry chunk pays
 * nothing for it: every byte here is in the scene chunk.
 *
 * Starts with the satellites (`orbitsVisible`). A skip lands it at once, and
 * so does reaching the orbits already at `site` (a seek, or a skip before
 * them). Under reduced motion it never starts: the stylesheet's fade is all.
 *
 * It flies on past `site`, which is where the city's build is admitted to the
 * main thread (ADR 016): ~0.8 s of long tasks, the longest over 400 ms, that
 * froze the letters as they pulled back. So it holds main-thread work
 * (`holdWork`) from the moment it starts until it lands, and the city builds
 * after it.
 */
export function HeadlineFlightLayer({
  state,
  active,
  holdWork,
}: {
  state: SequenceState
  active: boolean
  /** Holds deferred main-thread work back until the returned release is called. */
  holdWork: () => () => void
}) {
  const { camera, gl } = useThree()
  const flight = useRef<Flight | null>(null)
  const holdWorkRef = useRef(holdWork)
  holdWorkRef.current = holdWork

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.home-headline')
    if (!root || prefersReducedMotion()) return
    const title = root.querySelector<HTMLElement>('.home-headline__title')
    const text = title?.firstChild
    if (!title || !(text instanceof Text) || !text.data.trim()) return

    const layer = document.createElement('div')
    layer.className = 'home-headline__flight'
    layer.setAttribute('aria-hidden', 'true')
    const letters: Letter[] = []
    for (let index = 0; index < text.data.length; index += 1) {
      const char = text.data[index]
      if (/\s/.test(char)) continue
      const el = document.createElement('span')
      el.textContent = char
      layer.append(el)
      letters.push({ el, index, order: letters.length, along: 0, targetX: 0, targetY: 0, glyphX: 0, glyphY: 0 })
    }
    root.append(layer)

    const f: Flight = {
      root,
      title,
      text,
      layer,
      letters,
      fontScale: 1,
      focal: 1,
      started: false,
      landed: false,
      skipped: false,
      time: 0,
      duration: 0,
      measured: '',
      release: null,
    }
    flight.current = f
    rewind(f)

    // The same presses App skips the tail on, and only inside the tail: at
    // `site` a press is the visitor using the page, and a drag on the globe
    // while the letters fly should not cut them short.
    const inTail = () => state.phase !== 'draw' && state.phase !== 'site'
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (inTail()) f.skipped = true
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inTail()) f.skipped = true
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      releaseWork(f)
      layer.remove()
      delete root.dataset.flight
      flight.current = null
    }
    // `state` is one object for the scene's lifetime.
  }, [state])

  const scratch = useRef<Scratch | null>(null)

  useFrame((_, rawDelta) => {
    const f = flight.current
    if (!f || !active) return

    if (!orbitsVisible(state)) {
      // A replay rewound the tail past the orbits: fly again.
      if (f.started) rewind(f)
      return
    }
    if (!f.started) {
      f.started = true
      // Arriving at the orbits already at `site` is a seek or a skip, not the tail.
      if (atOrAfter(state.phase, 'site')) f.skipped = true
      else f.release = holdWorkRef.current()
    }
    if (f.landed) return
    if (f.skipped) {
      land(f)
      return
    }

    f.time += clampFrameDelta(rawDelta)
    const s = (scratch.current ??= createScratch())
    const cam = camera as THREE.PerspectiveCamera
    cam.updateMatrixWorld()
    const canvas = gl.domElement.getBoundingClientRect()
    const rootBox = f.root.getBoundingClientRect()

    const earthRadius = EARTH_CONFIG.radius
    s.eye.setFromMatrixPosition(cam.matrixWorld)
    s.right.setFromMatrixColumn(cam.matrixWorld, 0)
    s.up.setFromMatrixColumn(cam.matrixWorld, 1)
    s.forward.copy(s.centre).sub(s.eye)
    const centreDistance = s.forward.length()
    s.forward.normalize()
    const restDistance = centreDistance - HEADLINE_FLIGHT.restDepth * earthRadius
    const radius = orbitRadius(centreDistance, restDistance, earthRadius)
    const { tilt } = HEADLINE_FLIGHT
    // Raised by as much as its tilt drops its near point, so the word brakes
    // across the planet's middle rather than under it. Its far half stays
    // behind the disc.
    ringFrame(s.eye, s.right, s.up, s.centre, radius, tilt, s.ring)
    s.ring.centre.addScaledVector(s.up, radius * Math.sin(tilt))

    // Targets follow the layout, which only a resize moves.
    const key = `${canvas.width}x${canvas.height}`
    if (f.measured !== key) {
      // CSS pixels per world unit at distance 1.
      f.focal = (cam.projectionMatrix.elements[5] * canvas.height) / 2
      measure(f)
      f.measured = key
    }

    // The radius follows the camera, so the spacing does too: the word's
    // middle rides the angle the schedule gives, the rest round it.
    const middle = letterLag(f.letters[f.letters.length - 1].along / 2, restDistance, radius, f.focal)

    const fade = fadeIn(f.time)
    for (const letter of f.letters) {
      const amount = liftAmount(f.time, letter.order)
      let x: number
      let y: number
      let scale = 1
      let turn = 1
      let cover = 1
      if (amount >= 1) {
        x = letter.targetX
        y = letter.targetY
      } else {
        const angle = letterAngle(f.time, middle - letterLag(letter.along, restDistance, radius, f.focal))
        ringPoint(s.ring, angle, s.point)
        // A letter turns with the orbit, as if printed on it, and straightens
        // as it pulls back. Seen from behind it is gone.
        turn = THREE.MathUtils.lerp(ringTurn(s.ring, angle, s.eye, s.point), 1, amount)
        if (amount > 0) {
          // The target, as the point on the rest plane that projects onto it.
          s.target
            .set(
              ((letter.targetX - canvas.left) / canvas.width) * 2 - 1,
              -((letter.targetY - canvas.top) / canvas.height) * 2 + 1,
              0.5,
            )
            .unproject(cam)
            .sub(s.eye)
            .normalize()
          s.target.multiplyScalar(restDistance / s.target.dot(s.forward)).add(s.eye)
          s.point.lerp(s.target, amount)
        }
        cover = planetCover(s.eye, s.point, s.centre, earthRadius)
        scale = restDistance / s.temp.copy(s.point).sub(s.eye).dot(s.forward)
        s.temp.copy(s.point).project(cam)
        x = canvas.left + ((s.temp.x + 1) / 2) * canvas.width
        y = canvas.top + ((1 - s.temp.y) / 2) * canvas.height
      }
      const dx = x - rootBox.left - letter.glyphX
      const dy = y - rootBox.top - letter.glyphY
      const size = scale / f.fontScale
      letter.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${size * Math.max(turn, 0)}, ${size})`
      letter.el.style.opacity = String(fade * cover * clamp01(turn / HEADLINE_FLIGHT.edgeOn))
    }

    if (f.time >= f.duration) land(f)
  })

  return null
}

interface Letter {
  el: HTMLSpanElement
  /** Its character's index in the title's text. */
  index: number
  /** Its place among the letters, in reading order. */
  order: number
  /** Its centre's distance along the title from the first letter's, in CSS pixels. */
  along: number
  /** Its glyph's centre in the real title, in viewport pixels. */
  targetX: number
  targetY: number
  /** Its glyph's centre inside its own span, from the layer's origin. */
  glyphX: number
  glyphY: number
}

interface Flight {
  root: HTMLElement
  title: HTMLElement
  text: Text
  layer: HTMLDivElement
  letters: Letter[]
  /**
   * How much bigger than the title the loose letters are set. A letter at the
   * front of the orbit is several times its size, and text scaled up by a
   * transform blurs: set large and scaled down, it stays sharp.
   */
  fontScale: number
  /** CSS pixels per world unit at distance 1. */
  focal: number
  started: boolean
  landed: boolean
  skipped: boolean
  time: number
  duration: number
  /** The canvas size the targets were measured at. */
  measured: string
  /** Lets the held main-thread work go; set while the letters fly. */
  release: (() => void) | null
}

interface Scratch {
  centre: THREE.Vector3
  eye: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  forward: THREE.Vector3
  point: THREE.Vector3
  target: THREE.Vector3
  temp: THREE.Vector3
  ring: RingFrame
}

function createScratch(): Scratch {
  const v = () => new THREE.Vector3()
  return {
    // The planet sits at the world origin (CameraController's EARTH_LOOK_AT).
    centre: v(),
    eye: v(),
    right: v(),
    up: v(),
    forward: v(),
    point: v(),
    target: v(),
    temp: v(),
    ring: { centre: v(), right: v(), toward: v(), radius: 1 },
  }
}

function releaseWork(f: Flight) {
  f.release?.()
  f.release = null
}

/** Back to before the orbits: real title hidden, letters waiting. */
function rewind(f: Flight) {
  releaseWork(f)
  f.started = false
  f.landed = false
  f.skipped = false
  f.time = 0
  f.layer.hidden = false
  for (const letter of f.letters) letter.el.style.opacity = '0'
  f.root.dataset.flight = 'flying'
}

/** Every letter in place: the real title takes over in this frame, and the held work may start. */
function land(f: Flight) {
  releaseWork(f)
  f.landed = true
  f.layer.hidden = true
  f.root.dataset.flight = 'landed'
}

/**
 * Where each letter goes and how far apart they ride: the real title's glyphs,
 * one range per character, and each loose letter's own glyph inside its span.
 */
function measure(f: Flight) {
  // The loose letters wear the title's type, so a glyph lands on its twin, at
  // `fontScale` times its size.
  const type = getComputedStyle(f.title)
  const { style } = f.layer
  f.fontScale = Math.ceil(HEADLINE_FLIGHT.nearScale)
  const px = (value: string) => (value.endsWith('px') ? `${parseFloat(value) * f.fontScale}px` : value)
  style.fontFamily = type.fontFamily
  style.fontSize = px(type.fontSize)
  style.fontWeight = type.fontWeight
  style.fontStyle = type.fontStyle
  style.lineHeight = px(type.lineHeight)
  style.letterSpacing = px(type.letterSpacing)
  style.textTransform = type.textTransform

  const range = document.createRange()
  const rootBox = f.root.getBoundingClientRect()
  // Widths of every character, spaces included, for the spacing along the orbit.
  const widths: number[] = []
  const boxes: DOMRect[] = []
  for (let i = 0; i < f.text.data.length; i += 1) {
    range.setStart(f.text, i)
    range.setEnd(f.text, i + 1)
    const box = range.getBoundingClientRect()
    boxes.push(box)
    widths.push(box.width)
  }
  const centreAlong = (i: number) => widths.slice(0, i).reduce((a, b) => a + b, 0) + widths[i] / 2
  const first = centreAlong(f.letters[0].index)

  for (const letter of f.letters) {
    const box = boxes[letter.index]
    letter.targetX = box.left + box.width / 2
    letter.targetY = box.top + box.height / 2

    letter.el.style.transform = ''
    const glyph = letter.el.firstChild
    if (glyph) {
      range.selectNodeContents(glyph)
      const own = range.getBoundingClientRect()
      letter.glyphX = own.left + own.width / 2 - rootBox.left
      letter.glyphY = own.top + own.height / 2 - rootBox.top
      letter.el.style.transformOrigin = `${letter.glyphX}px ${letter.glyphY}px`
    }

    letter.along = centreAlong(letter.index) - first
  }
  f.duration = flightDuration(f.letters.length)
}
