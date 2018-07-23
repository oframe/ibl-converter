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

uniform sampler2D tMap[7];

varying vec2 vUv;

void main() {
    vec2 uv = vUv;
    uv.y *= 2.0;
    vec4 tex;

    for(int i = 0; i < 7; i++) {
        if (uv.y >= 0.0 && uv.y <= 1.0) {
            tex = texture2D(tMap[i], uv);
        }
        uv.y -= 1.0;
        uv *= 2.0;
    }

    gl_FragColor = tex;
}
`;

export default {vertex, fragment};