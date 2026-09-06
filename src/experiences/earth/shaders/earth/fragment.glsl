uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform sampler2D uCloudsTexture;
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereDayColor;
uniform vec3 uAtmosphereTwilightColor;
uniform float uCloudIntensity;
uniform float uNightIntensity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main()
{
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 color = vec3(0.0);

    // Sun orientation
    float sunOrientation = dot(uSunDirection, normal);

    // Day / night color
    float dayMix = smoothstep(- 0.25, 0.5, sunOrientation);
    vec3 dayColor = texture(uDayTexture, vUv).rgb;
    vec3 nightColor = texture(uNightTexture, vUv).rgb * uNightIntensity;
    color = mix(nightColor, dayColor, dayMix);

    // Clouds
    //
    // .r, NOT .g. The map used to pack a water mask in .r and the clouds in .g;
    // it is now a greyscale clouds-only KTX2, and a greyscale Basis texture can
    // transcode to a red-only format (BC4/RGTC) on some GPUs, where .g reads 0
    // and the clouds disappear entirely. .r is correct for every transcode
    // target.
    //
    // The texture is deliberately NOT tagged sRGB — see EarthScene. This
    // threshold reads the authored value, so an sRGB decode would silently move
    // it and thin the clouds out.
    float clouds = texture(uCloudsTexture, vUv).r;
    float cloudsMix = smoothstep(0.5, 1.0, clouds) * uCloudIntensity;
    cloudsMix *= dayMix;
    color = mix(color, vec3(1.0), clamp(cloudsMix, 0.0, 1.0));

    // Fresnel
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 2.0);

    // Atmosphere
    float atmosphereDayMix = smoothstep(- 0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color = mix(color, atmosphereColor, fresnel * atmosphereDayMix);

    // Final color
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
