import { Renderer, Plane, Texture, RenderTarget, Program, Mesh } from '../ogl/OGL.js';
import SpecularShader from './shaders/SpecularShader.js';
import AtlasShader from './shaders/AtlasShader.js';

let OUTPUT_SIZE = 512;

// sRGB == 0
// RGBE == 1
// RGBM == 2
// RGBD == 3
let INPUT_TYPE = 1;
let OUTPUT_TYPE = 2;

const renderer = new Renderer({ alpha: true, premultipliedAlpha: true });
renderer.setSize(OUTPUT_SIZE, OUTPUT_SIZE);
export const gl = renderer.gl;
gl.clearColor(0, 0, 0, 0);
// document.body.appendChild(gl.canvas);

const geometry = new Plane(gl, 2, 2);

const specularProgram = new Program(gl, {
    vertexShader: SpecularShader.vertex,
    fragmentShader: SpecularShader.fragment,
    uniforms: {
        tMap: { value: null },
        uRoughness: { value: 0 },
        uInputType: { value: 0 },
        uOutputType: { value: 0 },
    },
    transparent: true,
});

const specularMesh = new Mesh(gl, { geometry, program: specularProgram });

const atlasProgram = new Program(gl, {
    vertexShader: AtlasShader.vertex,
    fragmentShader: AtlasShader.fragment,
    uniforms: {
        tMap: { value: null },
    },
    transparent: true,
});

const atlasMesh = new Mesh(gl, { geometry, program: atlasProgram });

export function renderSpecular(data) {
    INPUT_TYPE = data.inputType;
    OUTPUT_TYPE = data.outputType;

    // Create input texture
    const texture = new Texture(gl, {
        image: data.data,
        width: data.width,
        height: data.height,
        generateMipmaps: false,
    });

    let size = OUTPUT_SIZE;
    let num = 6; // Don't see why you'd want more than that
    // let num = Math.log(size) / Math.log(2) - 2;

    // Create RenderTargets for each roughness level
    const targets = [];

    for (var i = 0; i < num; i++) {
        const target = new RenderTarget(gl, {
            width: size,
            height: size / 2,
            wrapS: gl.REPEAT,
            // FLOAT, RGBFormat
        });
        targets.push(target);

        size = Math.max(16, size / 2);
    }

    // Update program with new texture and values
    specularProgram.uniforms.tMap.value = texture;
    specularProgram.uniforms.uInputType.value = INPUT_TYPE;
    specularProgram.uniforms.uOutputType.value = OUTPUT_TYPE;

    // randiance maps for specular
    targets.forEach((target, i) => {
        renderer.setSize(target.width, target.height);

        var r = i / (targets.length - 1) || 0;
        specularProgram.uniforms.uRoughness.value = r * 0.9;

        renderer.render({ scene: specularMesh, target });
        specularProgram.uniforms.tMap.value = target.texture;

        if (i === 0) specularProgram.uniforms.uInputType.value = specularProgram.uniforms.uOutputType.value;
    });

    // Update atlas textures
    atlasProgram.uniforms.tMap.value = targets.map((target) => target.texture);

    // Render all targets to atlas output
    renderer.setSize(OUTPUT_SIZE, OUTPUT_SIZE);

    // Need to render twice when on external server - I have no idea why
    renderer.render({ scene: atlasMesh });
    renderer.render({ scene: atlasMesh });
}
