precision highp float;

uniform samplerCube uNebula;

varying vec3 vDirection;

void main() {
  // No X flip. Three flips the X axis when sampling ordinary cube textures as
  // environment maps, but NOT for textures that came from a
  // WebGLCubeRenderTarget — which is what this is. If the sky ever appears
  // mirrored, this line is the cause and negating .x is the fix.
  gl_FragColor = vec4(textureCube(uNebula, normalize(vDirection)).rgb, 1.0);

  #include <colorspace_fragment>
}
