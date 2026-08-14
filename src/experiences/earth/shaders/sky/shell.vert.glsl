varying vec3 vDirection;

void main() {
  // The shell is a sphere centred on the origin and never rotated, so a
  // vertex's object-space position IS the direction to sample.
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
