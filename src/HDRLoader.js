// Load 32bit .hdr (RGBE) format

const RGBE_RETURN_FAILURE = -1;

// default error routine. Change this to change error handling
const READ_ERROR = 1;
const WRITE_ERROR = 2;
const FORMAT_ERROR = 3;
const MEMORY_ERROR = 4;

// flags indicating which fields in an rgbe_header_info are valid
const RGBE_VALID_PROGRAMTYPE = 1;
const RGBE_VALID_FORMAT = 2;
const RGBE_VALID_DIMENSIONS = 4;
const NEWLINE = '\n';

export function parseHDR(buffer) {
    // If src passed in instead
    // const buffer = await (await fetch(src)).arrayBuffer();

    const byteArray = new Uint8Array(buffer);
    byteArray.pos = 0;

    const rgbe_header_info = readHeader(byteArray);
    if (rgbe_header_info === RGBE_RETURN_FAILURE) return;

    let width = rgbe_header_info.width;
    let height = rgbe_header_info.height;
    let image_rgba_data = readPixels_RLE(byteArray.subarray(byteArray.pos), width, height);
    if (image_rgba_data === RGBE_RETURN_FAILURE) return;

    return {
        width,
        height,
        data: image_rgba_data,
        header: rgbe_header_info,
        gamma: rgbe_header_info.gamma,
        exposure: rgbe_header_info.exposure,
        format: 'RGBE',
        type: 'UnsignedByteType',
    };

    function logError(logError_code, msg) {
        switch (logError_code) {
            case READ_ERROR:
                console.error('Read Error: ' + (msg || ''));
                break;
            case WRITE_ERROR:
                console.error('Write Error: ' + (msg || ''));
                break;
            case FORMAT_ERROR:
                console.error('Bad File Format: ' + (msg || ''));
                break;
            default:
            case MEMORY_ERROR:
                console.error('Error: ' + (msg || ''));
        }
        return RGBE_RETURN_FAILURE;
    }

    function fgets(buffer, lineLimit = 1024, consume) {
        let p = buffer.pos;
        let i = -1;
        let len = 0;
        let s = '';
        let chunkSize = 128;
        let chunk = String.fromCharCode.apply(null, new Uint16Array(buffer.subarray(p, p + chunkSize)));

        while ((i = chunk.indexOf(NEWLINE)) < 0 && len < lineLimit && p < buffer.byteLength) {
            s += chunk;
            len += chunk.length;
            p += chunkSize;
            chunk += String.fromCharCode.apply(null, new Uint16Array(buffer.subarray(p, p + chunkSize)));
        }
        if (i > -1) {
            buffer.pos += len + i + 1;
            return s + chunk.slice(0, i);
        }
        return false;
    }

    function readHeader(buffer) {
        // regexes to parse header info fields
        const magic_token_re = /^#\?(\S+)$/;
        const gamma_re = /^\s*GAMMA\s*=\s*(\d+(\.\d+)?)\s*$/;
        const exposure_re = /^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/;
        const format_re = /^\s*FORMAT=(\S+)\s*$/;
        const dimensions_re = /^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/;

        // RGBE format header struct
        const header = {
            valid: 0 /* indicate which fields are valid */,
            string: '' /* the actual header string */,
            comments: '' /* comments found in header */,
            programtype:
                'RGBE' /* listed at beginning of file to identify it after "#?". defaults to "RGBE" */,
            format: '' /* RGBE format, default 32-bit_rle_rgbe */,
            gamma: 1.0 /* image has already been gamma corrected with given gamma. defaults to 1.0 (no correction) */,
            exposure: 1.0 /* a value of 1.0 in an image corresponds to <exposure> watts/steradian/m^2. defaults to 1.0 */,
            width: 0,
            height: 0 /* image dimensions, width/height */,
        };

        let line = fgets(buffer);
        if (buffer.pos >= buffer.byteLength || !line) return logError(READ_ERROR, 'no header found');

        let match = line.match(magic_token_re);
        if (!match) return logError(FORMAT_ERROR, 'bad initial token');

        header.valid |= RGBE_VALID_PROGRAMTYPE;
        header.programtype = match[1];
        header.string += line + '\n';

        while (true) {
            line = fgets(buffer);
            if (line === false) break;
            header.string += line + '\n';
            if (line.charAt(0) === '#') {
                header.comments += line + '\n';
                continue; // comment line
            }
            if ((match = line.match(gamma_re))) {
                header.gamma = parseFloat(match[1], 10);
            }
            if ((match = line.match(exposure_re))) {
                header.exposure = parseFloat(match[1], 10);
            }
            if ((match = line.match(format_re))) {
                header.valid |= RGBE_VALID_FORMAT;
                header.format = match[1]; //'32-bit_rle_rgbe';
            }
            if ((match = line.match(dimensions_re))) {
                header.valid |= RGBE_VALID_DIMENSIONS;
                header.height = parseInt(match[1], 10);
                header.width = parseInt(match[2], 10);
            }
            if (header.valid & RGBE_VALID_FORMAT && header.valid & RGBE_VALID_DIMENSIONS) break;
        }
        if (!(header.valid & RGBE_VALID_FORMAT)) {
            return logError(FORMAT_ERROR, 'missing format specifier');
        }
        if (!(header.valid & RGBE_VALID_DIMENSIONS)) {
            return logError(FORMAT_ERROR, 'missing image size specifier');
        }
        return header;
    }

    function readPixels_RLE(buffer, w, h) {
        const scanline_width = w;
        let num_scanlines = h;

        // run length encoding is not allowed so read flat
        // this file is not run length encoded
        if (
            scanline_width < 8 ||
            scanline_width > 0x7fff ||
            2 !== buffer[0] ||
            2 !== buffer[1] ||
            buffer[2] & 0x80
        ) {
            // return the flat buffer
            return new Uint8Array(buffer);
        }
        if (scanline_width !== ((buffer[2] << 8) | buffer[3])) {
            return logError(FORMAT_ERROR, 'wrong scanline width');
        }

        // Create output buffer
        const data_rgba = new Uint8Array(4 * w * h);
        if (!data_rgba || !data_rgba.length) return logError(MEMORY_ERROR, 'unable to allocate buffer space');

        let offset = 0;
        let pos = 0;
        const ptr_end = 4 * scanline_width;
        const rgbeStart = new Uint8Array(4);
        const scanline_buffer = new Uint8Array(ptr_end);

        // read in each successive scanline
        while (num_scanlines > 0 && pos < buffer.byteLength) {
            if (pos + 4 > buffer.byteLength) {
                return logError(READ_ERROR);
            }
            rgbeStart[0] = buffer[pos++];
            rgbeStart[1] = buffer[pos++];
            rgbeStart[2] = buffer[pos++];
            rgbeStart[3] = buffer[pos++];
            if (
                2 != rgbeStart[0] ||
                2 != rgbeStart[1] ||
                ((rgbeStart[2] << 8) | rgbeStart[3]) != scanline_width
            ) {
                return logError(FORMAT_ERROR, 'bad rgbe scanline format');
            }

            // read each of the four channels for the scanline into the buffer
            // first red, then green, then blue, then exponent
            let ptr = 0;
            while (ptr < ptr_end && pos < buffer.byteLength) {
                let count = buffer[pos++];
                const isEncodedRun = count > 128;
                if (isEncodedRun) count -= 128;
                if (0 === count || ptr + count > ptr_end) {
                    return logError(FORMAT_ERROR, 'bad scanline data');
                }
                if (isEncodedRun) {
                    // a (encoded) run of the same value
                    let byteValue = buffer[pos++];
                    for (let i = 0; i < count; i++) {
                        scanline_buffer[ptr++] = byteValue;
                    }
                } else {
                    // a literal-run
                    scanline_buffer.set(buffer.subarray(pos, pos + count), ptr);
                    ptr += count;
                    pos += count;
                }
            }

            // now convert data from buffer into rgba
            // first red, then green, then blue, then exponent (alpha)
            for (let i = 0; i < scanline_width; i++) {
                let off = 0;
                data_rgba[offset] = scanline_buffer[i + off];
                off += scanline_width; //1;
                data_rgba[offset + 1] = scanline_buffer[i + off];
                off += scanline_width; //1;
                data_rgba[offset + 2] = scanline_buffer[i + off];
                off += scanline_width; //1;
                data_rgba[offset + 3] = scanline_buffer[i + off];
                offset += 4;
            }
            num_scanlines--;
        }
        return data_rgba;
    }
}
