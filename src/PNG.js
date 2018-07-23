/*

Converts a Typed Array into an RGBA PNG.
Lossless, non-compressed, non-filtered.
Just the raw data wrapped in the necessary zlib headers.

*/

import { ArrayBufferWalker } from './PNGWalker.js';

export function writePNG(width, height, data) {
    let w = width;
    let h = height;

    const PRE_HEADER = '\x89PNG\r\n\x1A\n';
    const BLOCK_SIZE = 65535;
    const dataLength = w * h * 4 + h; // add extra height for filter byte per scanline
    const numberOfBlocks = Math.ceil(dataLength / BLOCK_SIZE);
    const zlibDataLength = (() => {
        return 1 + // Compression method/flags code
        1 + // Additional flags/check bits
        (5 * numberOfBlocks) + // Number of Zlib block headers we'll need
        4 + // ADLER checksum
        dataLength; // actual data
    })();

    const arrayBufferLength = 
        
        // Header
        8 +

        // IHDR
        4 + // Chunk length identifier
        4 + // chunk header
        13 + // actual IHDR length
        4 + // CRC32 check;

        // IDAT
        4 + // chunk length
        4 + // "IDAT"
        zlibDataLength + // raw data wrapped in the zlib shit
        4 + // CRC

        // IEND
        4 + // "IEND"
        4 + // CRC
        4; // length

    const buffer = new ArrayBuffer(arrayBufferLength);
    const walker = new ArrayBufferWalker(buffer);

    // Header
    walker.writeString(PRE_HEADER);

    // IHDR
    walker.writeUint32(13); // IDHR is always 13 bytes
    walker.startCRC();
    walker.writeString("IHDR");
    walker.writeUint32(w);
    walker.writeUint32(h);
    walker.writeUint8(8); // bitDepth
    walker.writeUint8(6); // color type. 6 = RGBA
    walker.writeUint8(0); // compressionMethod. 0 = none
    walker.writeUint8(0); // filter. 0 = none
    walker.writeUint8(0); // interface. 0 = none
    walker.writeCRC();

    // IDAT (data)
    walker.writeUint32(zlibDataLength);
    walker.startCRC();
    walker.writeString("IDAT");

    // zlib header
    walker.writeUint8(120);
    walker.writeUint8(1);

    let bytesLeft = dataLength;
    let bytesLeftInWindow = 0;

    function startBlock() {

        // Whether this is the final block. If we've got less than 32KB to write, then yes.
        let bfinal = bytesLeft < BLOCK_SIZE ? 1 : 0;

        // Compression type. Will always be zero = uncompressed
        let btype = 0;
        walker.writeUint8((bfinal) | (btype << 1));

        // Again, this logic comes from: https://github.com/imaya/zlib.js/blob/master/src/deflate.js#L110
        let blockLength = Math.min(bytesLeft, BLOCK_SIZE);
        let nlen = (~blockLength + 0x10000) & 0xffff;
        // IMPORTANT: these values must be little-endian.
        walker.writeUint16(blockLength, true);
        walker.writeUint16(nlen, true);

        bytesLeftInWindow = Math.min(bytesLeft, BLOCK_SIZE);
    }

    function writeBlockData(val) {
        if (bytesLeft <= 0) {
            throw new Error('Ran out of space');
        }
        if (bytesLeftInWindow === 0) {
            walker.pauseAdler();
            startBlock();
            walker.startAdler();
        }
        walker.writeUint8(val);
        bytesLeftInWindow--;
        bytesLeft--;
    }

    startBlock();
    walker.startAdler();

    // Read rows back-to-front as gl.readPixels method flips canvas
    for (let i = h - 1; i >= 0; i--) {
        writeBlockData(0); // filter type per scanline
        for (let j = 0; j < w; j++) {
            let pixel = i * w + j;
            writeBlockData(data[pixel * 4 + 0]); // red
            writeBlockData(data[pixel * 4 + 1]); // green
            writeBlockData(data[pixel * 4 + 2]); // blue
            writeBlockData(data[pixel * 4 + 3]); // alpha
        }
    }

    walker.writeAdler();
    walker.writeCRC();

    // IEND
    walker.writeUint32(0);
    walker.startCRC();
    walker.writeString('IEND');
    walker.writeCRC();

    return buffer;
}