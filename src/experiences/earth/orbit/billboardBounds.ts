import type * as THREE from 'three'
import type { ElementRect } from '../../../interaction/screenSpace'

/** Match createHoloPanel's vertex shader: transform the origin normally, then
 * offset along the camera's vertical axis using the accumulated model scale.
 * A world-space Box3 would include the parent's rotation, which the shader ignores. */
export function billboardBottom(
  object: THREE.Object3D,
  camera: THREE.Camera,
  rect: ElementRect,
  localBottom: number,
  scratch: THREE.Vector3,
): number | null {
  if (rect.height <= 0) return null
  object.updateWorldMatrix(true, false)
  camera.updateWorldMatrix(true, false)
  const matrix = object.matrixWorld.elements
  const scaleY = Math.hypot(matrix[4], matrix[5], matrix[6])
  scratch.setFromMatrixPosition(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse)
  if (scratch.z >= 0) return null
  scratch.y += localBottom * scaleY
  scratch.applyMatrix4(camera.projectionMatrix)
  if (!Number.isFinite(scratch.y) || scratch.z < -1 || scratch.z > 1) return null
  // Do not reject edges outside the viewport: above it means more room below,
  // while below it means the sheet must wait for the camera to arrive.
  return rect.top + (1 - scratch.y) * rect.height / 2
}
