import * as THREE from 'three'

/**
 * `renderer.compileAsync`, for the programs a scene uses when it is drawn into a
 * render target rather than onto the canvas.
 *
 * three keys a program on where it draws. With no render target bound it bakes
 * the renderer's tone mapping and output colour space into the shader; into any
 * target it bakes neither (three 0.174, `WebGLPrograms.getParameters`). A plain
 * `compileAsync` runs with no target bound, so it prepares the canvas variant
 * only — and a scene drawn through the composer's targets then compiles its real
 * programs synchronously, on whichever frame first draws each material.
 *
 * The target only has to be bound while `compileAsync` collects its materials,
 * which happens before the call returns; the wait that follows is a poll on
 * programs that already exist. Its size and type are irrelevant to the key.
 *
 * A program compiled here does not replace the canvas one: three keeps every
 * program a material has used, so a scene drawn both ways can warm both.
 */
export function compileAsyncForRenderTarget(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  camera: THREE.Camera,
): Promise<unknown> {
  const target = new THREE.WebGLRenderTarget(1, 1)
  const previous = renderer.getRenderTarget()
  let pending: Promise<unknown>
  try {
    renderer.setRenderTarget(target)
    pending = renderer.compileAsync(scene, camera)
  } catch (error) {
    target.dispose()
    throw error
  } finally {
    renderer.setRenderTarget(previous)
  }
  return pending.finally(() => target.dispose())
}
