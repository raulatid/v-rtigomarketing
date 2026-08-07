// Fixed Earth appearance. Values carried over from dolly-earth's default tuning;
// they are not exposed in the debug overlay because the intro never changes them.

export const EARTH_CONFIG = {
  // Keep at 2 to match dolly-earth. earth-connections' orbit presets assume
  // radius 1, so a future orbit system takes scale={2} rather than a rewrite.
  radius: 2,
  atmosphereDayColor: '#00aaff',
  atmosphereTwilightColor: '#ff6600',
  sunAzimuth: 0.5,
  sunElevation: 0,
  cloudIntensity: 1,
  specularIntensity: 1,
  nightIntensity: 1,
  rotationSpeed: 0.035, // rad/s
}
