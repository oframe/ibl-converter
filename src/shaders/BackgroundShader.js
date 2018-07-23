const vertex = `
precision highp float;
precision highp int;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec2 vUv;

void main() {
    vUv = uv;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = `
precision highp float;
precision highp int;

uniform sampler2D tMap;
uniform float uInputType;

varying vec2 vUv;

vec4 SRGBtoLinear(vec4 srgb) {
    vec3 linOut = pow(srgb.xyz, vec3(2.2));
    return vec4(linOut, srgb.w);
}

vec4 RGBMToLinear(vec4 value) {
    float maxRange = 6.0;
    return vec4(value.xyz * value.w * maxRange, 1.0);
}

vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

vec4 RGBDtoLinear(vec4 value) {
    float maxRange = 6.0;
    return vec4(value.rgb * ((maxRange / 255.0) / value.a), 1.0);
}

vec4 RGBEtoLinear(vec4 value) {
    return vec4(value.rgb * exp2(value.a * 255.0 - 128.0), 1.0);
}

void main() {
    vec4 color;

    // 'If else' statements caused the strangest gpu bug
    // if (uInputType < 0.5) {
        
    //     // sRGB == 0
    //     color = SRGBtoLinear(texture2D(tMap, vUv));
    // } else if (uInputType < 1.5) {
        
    //     // RGBE == 1
    //     color = RGBEtoLinear(texture2D(tMap, vUv));
    // } else if (uInputType < 2.5) {
        
    //     // RGBM == 2
    //     color = RGBMToLinear(texture2D(tMap, vUv));
    // } else if (uInputType < 3.5) {
        
    //     // RGBD == 3
    //     color = RGBDtoLinear(texture2D(tMap, vUv));
    // }

    // sRGB == 0
    color = SRGBtoLinear(texture2D(tMap, vUv));        
        
    // RGBE == 1
    float mixRGBE = clamp(1.0 - abs(uInputType - 1.0), 0.0, 1.0);
    color = mix(color, RGBEtoLinear(texture2D(tMap, vUv)), mixRGBE);

    // RGBM == 2
    float mixRGBM = clamp(1.0 - abs(uInputType - 2.0), 0.0, 1.0);
    color = mix(color, RGBMToLinear(texture2D(tMap, vUv)), mixRGBM);
        
    // RGBD == 3
    float mixRGBD = clamp(1.0 - abs(uInputType - 3.0), 0.0, 1.0);
    color = mix(color, RGBDtoLinear(texture2D(tMap, vUv)), mixRGBD);

    gl_FragColor = color;
    gl_FragColor.rgb = linearToSRGB(gl_FragColor.rgb);
}
`;

export default {vertex, fragment};