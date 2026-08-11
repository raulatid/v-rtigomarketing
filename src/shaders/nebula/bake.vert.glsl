varying vec3 vDirection;

void main() {
  // The bake renders an inverted unit sphere from its centre, so a vertex's
  // object-space position IS the direction it represents. The sphere is never
  // rotated, so this needs no matrix.
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
