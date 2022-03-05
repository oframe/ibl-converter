import {
    Renderer,
    Transform,
    Camera,
    Orbit,
    Geometry,
    Sphere,
    Cube,
    Texture,
    Program,
    Mesh,
    Color,
    Vec3,
} from '../ogl/OGL.js';
import { convertGLSL } from './GLSLVersion.js';
import PBRShader from './shaders/PBRShader.js';
import BackgroundShader from './shaders/BackgroundShader.js';

const OUTPUT_SIZE = 512;

// sRGB == 0
// RGBE == 1
// RGBM == 2
// RGBD == 3
let INPUT_TYPE = 0;

const renderer = new Renderer({ dpr: 2 });
renderer.setSize(OUTPUT_SIZE, OUTPUT_SIZE);
const gl = renderer.gl;
document.body.appendChild(gl.canvas);

const camera = new Camera(gl, { fov: 35 });
camera.position.set(2, 0.5, 3);

// Create controls and pass parameters
const controls = new Orbit(camera, {
    enableZoom: false,
});

function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
}
window.addEventListener('resize', resize, false);
resize();

const scene = new Transform();

const program = new Program(gl, {
    vertexShader: PBRShader.vertex,
    fragmentShader: PBRShader.fragment,
    uniforms: {
        uBaseColor: { value: new Color([1, 1, 1]) },

        tRMO: { value: getTexture('src/assets/materials/hammered-metal-mro.jpg') },
        uRoughness: { value: 1 },
        uMetallic: { value: 1 },
        uOcclusion: { value: 1 },

        tNormal: { value: getTexture('src/assets/materials/hammered-metal-normal.jpg') },
        uNormalScale: { value: 2 },
        uNormalUVScale: { value: 3 },

        tLUT: { value: getTexture('src/assets/lut.png', false) },

        tEnvDiffuse: { value: getTexture('src/assets/interior-diffuse-RGBM.png', false) },
        tEnvSpecular: { value: getTexture('src/assets/interior-specular-RGBM.png', false) },
        uEnvSpecular: { value: 1.0 },

        uInputType: { value: 2 },

        uLightDirection: { value: new Color([1, 1, 1]) },
        uLightColor: { value: new Vec3(1) },
    },
});

loadShaderBall();
async function loadShaderBall() {
    const data = await (await fetch(`src/assets/shaderball.json`)).json();

    const geometry = new Geometry(gl, {
        position: { size: 3, data: new Float32Array(data.position) },
        uv: { size: 2, data: new Float32Array(data.uv) },
        normal: { size: 3, data: new Float32Array(data.normal) },
    });

    const mesh = new Mesh(gl, { geometry, program });
    mesh.position.y = -0.5;
    mesh.setParent(scene);
}

const bgGeometry = new Sphere(gl, 1, 32);

const bgProgram = new Program(gl, {
    vertexShader: convertGLSL(gl, BackgroundShader.vertex),
    fragmentShader: convertGLSL(gl, BackgroundShader.fragment),
    uniforms: {
        tMap: { value: getTexture('src/assets/interior-diffuse-RGBM.png', false) },

        uInputType: { value: 2 },
    },
    cullFace: gl.FRONT,
});

const background = new Mesh(gl, { geometry: bgGeometry, program: bgProgram });
background.scale.set(5);
background.setParent(scene);

function getTexture(src, generateMipmaps = true) {
    const texture = new Texture(gl, { generateMipmaps });
    texture.wrapS = texture.wrapT = gl.REPEAT;
    const image = new Image();
    image.onload = () => {
        texture.image = image;
    };
    image.src = src;

    return texture;
}

export function initPBR() {
    animate();
    function animate() {
        requestAnimationFrame(animate);

        controls.update();
        renderer.render({ scene, camera });
    }
}

export function updateIBL(specularData, diffuseData, inputType) {
    const diffuse = getTexture(URL.createObjectURL(new Blob([diffuseData], { type: 'image/png' })), false);
    const specular = getTexture(URL.createObjectURL(new Blob([specularData], { type: 'image/png' })), false);

    bgProgram.uniforms.tMap.value = diffuse;
    bgProgram.uniforms.uInputType.value = inputType;

    program.uniforms.tEnvDiffuse.value = diffuse;
    program.uniforms.tEnvSpecular.value = specular;
    program.uniforms.uInputType.value = inputType;
}
