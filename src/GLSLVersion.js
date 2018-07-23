export function toGLSL100(input) {
    return input;

    // TODO: convert down
    // if dfdy or dfdx add '#extension GL_OES_standard_derivatives : enable\n'
}

export function toGLSL300(input) {
    const lines = input.split('\n');

    // Determine if vertex or fragment by checking if gl_Position present
    const isVertex = !!~input.indexOf('gl_Position');

    // Must start with version
    let output = '#version 300 es\n';

    lines.forEach(line => {

        // Skip any old version lines
        if (!!~line.indexOf('#version')) return;

        // Skip any extension lines
        if (!!~line.indexOf('#extension')) return;

        // Replace 'attribute' with 'in'
        if (isVertex) line = line.split('attribute').join('in');

        // Replace 'varying' with 'in' or 'out'
        line = line.split('varying').join(isVertex ? 'out' : 'in');

        // Replace 'texture2D' and 'textureCube' with 'texture'
        line = line.split('texture2D').join('texture');
        line = line.split('textureCube').join('texture');

        // Add replacement output for gl_FragColor just before main()
        if (!isVertex) line = line.split('void main()').join('out vec4 fragColor;\nvoid main()');
        
        // Replace 'gl_FragColor' with 'fragColor'
        if (!isVertex) line = line.split('gl_FragColor').join('fragColor');

        output += `${line}\n`;
    });
    
    return output;
}

// Automatically determine which GLSL version for the active WebGL version
export function convertGLSL(gl, input) {
    const isGLSL300 = !!~input.indexOf('#version 300 es');
    if (gl.renderer.isWebgl2) {
        if (isGLSL300) return input;
        return toGLSL300(input);
    } else {
        if (!isGLSL300) return input;
        return toGLSL100(input);
    }
}