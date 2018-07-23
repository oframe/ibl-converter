const vertex = `
precision highp float;
precision highp int;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
    vUv = uv;
    
    gl_Position =  vec4(position, 1.0);
}
`;

const fragment = `
precision highp float;
precision highp int;

uniform sampler2D tMap;
uniform float uInputType;
uniform float uOutputType;

varying vec2 vUv;

const float PI = 3.14159265359;
const float PI2 = 6.28318530718;
const float RECIPROCAL_PI = 0.31830988618;
const float RECIPROCAL_PI2 = 0.15915494;

vec4 SRGBtoLinear(vec4 srgb) {
    vec3 linOut = pow(srgb.xyz, vec3(2.2));
    return vec4(linOut, srgb.w);;
}

vec4 linearToSRGB(vec4 color) {
    return vec4(pow(color.rgb, vec3(1.0 / 2.2)), color.a);
}

vec4 RGBEToLinear(in vec4 value) {
    return vec4(value.rgb * exp2(value.a * 255.0 - 128.0), 1.0);
}

vec4 LinearToRGBE(in vec3 value) {
    float maxComponent = max(max(value.r, value.g), value.b);
    float fExp = clamp(ceil(log2(maxComponent)), -128.0, 127.0);
    return vec4(value.rgb / exp2(fExp), (fExp + 128.0) / 255.0);
}

vec4 RGBMToLinear(in vec4 value) {
    float maxRange = 6.0;
    return vec4(value.xyz * value.w * maxRange, 1.0);
}

vec4 LinearToRGBM(in vec3 value) {
    float maxRange = 6.0;
    float maxRGB = max(value.x, max(value.g, value.b));
    float M = clamp(maxRGB / maxRange, 0.0, 1.0);
    M = ceil(M * 255.0) / 255.0;
    return vec4(value.rgb / (M * maxRange), M);
}

vec4 RGBDToLinear(in vec4 value, in float maxRange) {
    return vec4(value.rgb * ((maxRange / 255.0) / value.a), 1.0);
}

vec4 LinearToRGBD(in vec3 value, in float maxRange) {
    float maxRGB = max(value.x, max(value.g, value.b));
    float D = max(maxRange / maxRGB, 1.0);
    D = min(floor(D) / 255.0, 1.0);
    return vec4(value.rgb * (D * (255.0 / maxRange)), D);
}

vec2 cartesianToPolar(vec3 n) {
    vec2 uv;
    uv.x = atan(n.z, n.x) * RECIPROCAL_PI2 + 0.5;
    uv.y = asin(n.y) * RECIPROCAL_PI + 0.5;
    return uv;
}

vec3 polarToCartesian(vec2 uv) {
    float theta = (uv.x - 0.5) * PI2;
    float phi = (uv.y) * PI;

    vec3 n;
    n.x = sin(phi) * cos(theta);
    n.z = sin(phi) * sin(theta);
    n.y = -cos(phi);
    return normalize(n);
}

void main() {
    vec2 uv = vUv;
    vec3 normal = polarToCartesian(uv);
    vec3 irradiance;  

    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = cross(up, normal);
    up = cross(normal, right);

    const float delta = 0.025;
    float samples = 0.0; 
    for(float phi = 0.0; phi < PI2; phi += delta) {
        for(float theta = 0.0; theta < 0.5 * PI; theta += delta) {
            vec3 tangent = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
            vec3 dir = tangent.x * right + tangent.y * up + tangent.z * normal; 
            
            vec3 sample;
            if (uInputType < 0.5) {
                
                // sRGB == 0
                sample = SRGBtoLinear(texture2D(tMap, cartesianToPolar(dir))).rgb;
            } else if (uInputType < 1.5) {
                
                // RGBE == 1
                sample = RGBEToLinear(texture2D(tMap, cartesianToPolar(dir))).rgb;
            } else if (uInputType < 2.5) {
                
                // RGBM == 2
                sample = RGBMToLinear(texture2D(tMap, cartesianToPolar(dir))).rgb;
            } else if (uInputType < 3.5) {
                
                // RGBD == 3
                sample = RGBDToLinear(texture2D(tMap, cartesianToPolar(dir)), 6.0).rgb;
            }
            irradiance += sample * cos(theta) * sin(theta);

            samples++;
        }
    }
    irradiance = PI * irradiance / samples;

    if (uOutputType < 0.5) {

        // sRGB == 0
        gl_FragColor = linearToSRGB(vec4(irradiance, 1.0));
    } else if (uOutputType < 1.5) {
        
        // RGBE == 1
        gl_FragColor = LinearToRGBE(irradiance);
    } else if (uOutputType < 2.5) {
        
        // RGBM == 2
        gl_FragColor = LinearToRGBM(irradiance);
    } else if (uOutputType < 3.5) {
        
        // RGBD == 3
        gl_FragColor = LinearToRGBD(irradiance, 6.0);
    }
}
`;

export default {vertex, fragment};