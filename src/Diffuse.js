import {Renderer, Plane, Texture, RenderTarget, Program, Mesh} from '../ogl/OGL.js';
import DiffuseShader from './shaders/DiffuseShader.js';

// TODO: try and minimize harsh point at poles

let OUTPUT_SIZE = 128;

// sRGB == 0
// RGBE == 1
// RGBM == 2
// RGBD == 3
let INPUT_TYPE = 1;
let OUTPUT_TYPE = 2;

const renderer = new Renderer({alpha: true, premultipliedAlpha: true});
renderer.setSize(OUTPUT_SIZE, OUTPUT_SIZE / 2);
export const gl = renderer.gl;
gl.clearColor(0, 0, 0, 0);
// document.body.appendChild(gl.canvas);

const geometry = new Plane(gl, 2, 2);

const program = new Program(gl, {
    vertexShader: DiffuseShader.vertex,
    fragmentShader: DiffuseShader.fragment,
    uniforms: {
        tMap: {value: null},
        uInputType: {value: 0},
        uOutputType: {value: 0},
    },
    transparent: true,
});

const mesh = new Mesh(gl, {geometry, program});

export function renderDiffuse(data) {
    INPUT_TYPE = data.inputType;
    OUTPUT_TYPE = data.outputType;

    // Create input texture
    const texture = new Texture(gl, {
        image: data.data,
        width: data.width,
        height: data.height,
        generateMipmaps: false,
    });
    
    // Update program with new texture and values
    program.uniforms.tMap.value = texture;
    program.uniforms.uInputType.value = INPUT_TYPE;
    program.uniforms.uOutputType.value = OUTPUT_TYPE;

    const size = OUTPUT_SIZE;

    renderer.setSize(size, size / 2);

    // Need to render twice when on external server - I have no idea why
    renderer.render({scene: mesh});
    renderer.render({scene: mesh});
}