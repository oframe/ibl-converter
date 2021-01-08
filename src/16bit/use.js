import './assets/pako_deflate.js';
import { encodePNG } from './assets/PNG.js';
import { saveAs } from './assets/saveAs.js';

{
    const width = 256;
    const height = 256;
    const colorChannels = 3;
    const alphaChannels = 0;
    const depth = 16;
    const array = new Uint16Array(width * height * (colorChannels + alphaChannels));
    const max = 65535;
    // const depth = 8;
    // const array = new Uint8Array(width * height * (colorChannels + alphaChannels));

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            array[(i * width + j) * 3 + 0] = (j / width) * max;
            array[(i * width + j) * 3 + 1] = (j / width) * max;
            array[(i * width + j) * 3 + 2] = (j / width) * max;
        }
    }

    // for (let i = 0, j = 0; i < array.length; i += colorChannels + alphaChannels, j++) {
    //     // 65535 = max
    //     array[i + 0] = j;
    //     array[i + 1] = j;
    //     array[i + 2] = j;
    //     // array[i + 0] = (j / 65535) * 255;
    //     // array[i + 1] = (j / 65535) * 255;
    //     // array[i + 2] = (j / 65535) * 255;
    //     // array[i + 0] = Math.random() * 65535;
    //     // array[i + 1] = Math.random() * 65535;
    //     // array[i + 2] = Math.random() * 65535;
    // }

    const dataView = new DataView(array.buffer);

    // Swap little to big endian
    if (depth === 16) {
        for (let i = 0; i < dataView.byteLength / 2; i++) {
            dataView.setUint16(i * 2, swap16(dataView.getUint16(i * 2)));
        }
    }

    function swap16(val) {
        return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
    }

    const png = encodePNG([dataView.buffer], width, height, colorChannels, alphaChannels, depth);

    // saveAs(png, 'test.png');
}
