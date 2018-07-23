const vertex = `
precision highp float;
precision highp int;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const fragment = `
precision highp float;
precision highp int;

uniform sampler2D tMap;
uniform float uRoughness;
uniform float uInputType;
uniform float uOutputType;

varying vec2 vUv;

const int SAMPLES = 1000;

const float PI = 3.14159265359;
const float PI2 = 6.28318530718;
const float RECIPROCAL_PI = 0.31830988618;
const float RECIPROCAL_PI2 = 0.15915494;

float VanDerCorpus(int n, int base) {
    float invBase = 1.0 / float(base);
    float denom = 1.0;
    float result = 0.0;

    for(int i = 0; i < 32; ++i) {
        if(n > 0) {
            denom = mod(float(n), 2.0);
            result += denom * invBase;
            invBase = invBase / 2.0;
            n = int(float(n) / 2.0);
        }
    }
    return result;
}

vec2 Hammersley(int i, int N) {
    return vec2(float(i) / float(N), VanDerCorpus(i, 2));
}

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
    float maxRGB = max(value.r, max(value.g, value.b));
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

vec3 importanceSampleGGX(vec2 uv, mat3 mNormal, float roughness) {
    float a = roughness * roughness;
    float phi = 2.0 * PI * uv.x;
    float cosTheta = sqrt((1.0 - uv.y) / (1.0 + (a * a - 1.0) * uv.y));
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    return mNormal * vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
}

mat3 matrixFromVector(vec3 n) {
    float a = 1.0 / (1.0 + n.z);
    float b = -n.x * n.y * a;
    vec3 b1 = vec3(1.0 - n.x * n.x * a, b, -n.x);
    vec3 b2 = vec3(b, 1.0 - n.y * n.y * a, -n.y);
    return mat3(b1, b2, n);
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
    mat3 mNormal = matrixFromVector(normal);
    vec3 color;
    vec3 dir;
    for(int i = 0; i < SAMPLES; i++) {
        vec2 r = Hammersley(i, SAMPLES);
        dir = importanceSampleGGX(vec2(float(i) / float(SAMPLES), r), mNormal, uRoughness);
        
        if (uInputType < 0.5) {

            // sRGB == 0
            color.rgb += SRGBtoLinear(texture2D(tMap, cartesianToPolar(dir))).rgb;
        } else if (uInputType < 1.5) {
            
            // RGBE == 1
            color.rgb += RGBEToLinear(texture2D(tMap, cartesianToPolar(dir))).rgb;
        } else if (uInputType < 2.5) {
            
            // RGBM == 2
            color.rgb += RGBMToLinear(texture2D(tMap, cartesianToPolar(dir))).rgb;
        } else if (uInputType < 3.5) {
            
            // RGBD == 3
            color.rgb += RGBDToLinear(texture2D(tMap, cartesianToPolar(dir)), 6.0).rgb;
        }
    }
    color /= float(SAMPLES);

    if (uOutputType < 0.5) {

        // sRGB == 0
        gl_FragColor = linearToSRGB(vec4(color, 1.0));
    } else if (uOutputType < 1.5) {
        
        // RGBE == 1
        gl_FragColor = LinearToRGBE(color);
    } else if (uOutputType < 2.5) {
        
        // RGBM == 2
        gl_FragColor = LinearToRGBM(color);
    } else if (uOutputType < 3.5) {
        
        // RGBD == 3
        gl_FragColor = LinearToRGBD(color, 6.0);
    }
}
`;

export default {vertex, fragment};