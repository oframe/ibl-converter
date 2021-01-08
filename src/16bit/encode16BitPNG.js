// Heavily stripped back from UPNG.js

/* Utils */
function writeUint(buff, p, n) {
    buff[p] = (n >> 24) & 255;
    buff[p + 1] = (n >> 16) & 255;
    buff[p + 2] = (n >> 8) & 255;
    buff[p + 3] = n & 255;
}
function writeASCII(data, p, s) {
    for (var i = 0; i < s.length; i++) data[p + i] = s.charCodeAt(i);
}

const crcTable = (function () {
    var tab = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
            if (c & 1) c = 0xedb88320 ^ (c >>> 1);
            else c = c >>> 1;
        }
        tab[n] = c;
    }
    return tab;
})();
function crcUpdate(c, buf, off, len) {
    for (var i = 0; i < len; i++) c = crcTable[(c ^ buf[off + i]) & 0xff] ^ (c >>> 8);
    return c;
}
function crc(b, o, l) {
    return crcUpdate(0xffffffff, b, o, l) ^ 0xffffffff;
}

export function encodePNG(bufs, w, h, cc, ac, depth, dels, tabs) {
    var nimg = { ctype: 0 + (cc == 1 ? 0 : 2) + (ac == 0 ? 0 : 4), depth: depth, frames: [] };

    var bipp = (cc + ac) * depth,
        bipl = bipp * w;
    for (var i = 0; i < bufs.length; i++)
        nimg.frames.push({
            rect: { x: 0, y: 0, width: w, height: h },
            img: new Uint8Array(bufs[i]),
            blend: 0,
            dispose: 1,
            bpp: Math.ceil(bipp / 8),
            bpl: Math.ceil(bipl / 8),
        });

    compressPNG(nimg);

    var out = encodeMain(nimg, w, h, dels, tabs);
    return out;
}

function compressPNG(out) {
    for (var i = 0; i < out.frames.length; i++) {
        var frm = out.frames[i],
            nh = frm.rect.height;
        var fdata = new Uint8Array(nh * frm.bpl + nh);
        frm.cimg = filterZero(frm.img, nh, frm.bpp, frm.bpl, fdata);
    }
}

function filterZero(img, h, bpp, bpl, data) {
    var fls = [];
    var opts = { level: 0 };
    var CMPR = pako;

    for (var y = 0; y < h; y++) filterLine(data, img, y, bpl, bpp, 0);
    fls.push(CMPR['deflate'](data, opts));

    var ti,
        tsize = 1e9;
    for (var i = 0; i < fls.length; i++)
        if (fls[i].length < tsize) {
            ti = i;
            tsize = fls[i].length;
        }
    return fls[ti];
}
function filterLine(data, img, y, bpl, bpp, type) {
    var i = y * bpl,
        di = i + y;
    data[di] = type;
    di++;

    if (type == 0) {
        if (bpl < 500) for (var x = 0; x < bpl; x++) data[di + x] = img[i + x];
        else data.set(new Uint8Array(img.buffer, i, bpl), di);
    }
}

function encodeMain(nimg, w, h, dels, tabs) {
    if (tabs == null) tabs = {};
    var wUi = writeUint,
        wAs = writeASCII;
    var offset = 8,
        pltAlpha = false;

    var leng = 8 + (16 + 5 + 4); /*+ (9+4)*/
    if (tabs['sRGB'] != null) leng += 8 + 1 + 4;
    if (tabs['pHYs'] != null) leng += 8 + 9 + 4;
    if (nimg.ctype == 3) {
        var dl = nimg.plte.length;
        for (var i = 0; i < dl; i++) if (nimg.plte[i] >>> 24 != 255) pltAlpha = true;
        leng += 8 + dl * 3 + 4 + (pltAlpha ? 8 + dl * 1 + 4 : 0);
    }
    for (var j = 0; j < nimg.frames.length; j++) {
        var fr = nimg.frames[j];
        leng += fr.cimg.length + 12;
        if (j != 0) leng += 4;
    }
    leng += 12;

    var data = new Uint8Array(leng);
    var wr = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (var i = 0; i < 8; i++) data[i] = wr[i];

    wUi(data, offset, 13);
    offset += 4;
    wAs(data, offset, 'IHDR');
    offset += 4;
    wUi(data, offset, w);
    offset += 4;
    wUi(data, offset, h);
    offset += 4;
    data[offset] = nimg.depth;
    offset++; // depth
    data[offset] = nimg.ctype;
    offset++; // ctype
    data[offset] = 0;
    offset++; // compress
    data[offset] = 0;
    offset++; // filter
    data[offset] = 0;
    offset++; // interlace
    wUi(data, offset, crc(data, offset - 17, 17));
    offset += 4; // crc

    // 13 bytes to say, that it is sRGB
    if (tabs['sRGB'] != null) {
        wUi(data, offset, 1);
        offset += 4;
        wAs(data, offset, 'sRGB');
        offset += 4;
        data[offset] = tabs['sRGB'];
        offset++;
        wUi(data, offset, crc(data, offset - 5, 5));
        offset += 4; // crc
    }
    if (tabs['pHYs'] != null) {
        wUi(data, offset, 9);
        offset += 4;
        wAs(data, offset, 'pHYs');
        offset += 4;
        wUi(data, offset, tabs['pHYs'][0]);
        offset += 4;
        wUi(data, offset, tabs['pHYs'][1]);
        offset += 4;
        data[offset] = tabs['pHYs'][2];
        offset++;
        wUi(data, offset, crc(data, offset - 13, 13));
        offset += 4; // crc
    }

    if (nimg.ctype == 3) {
        var dl = nimg.plte.length;
        wUi(data, offset, dl * 3);
        offset += 4;
        wAs(data, offset, 'PLTE');
        offset += 4;
        for (var i = 0; i < dl; i++) {
            var ti = i * 3,
                c = nimg.plte[i],
                r = c & 255,
                g = (c >>> 8) & 255,
                b = (c >>> 16) & 255;
            data[offset + ti + 0] = r;
            data[offset + ti + 1] = g;
            data[offset + ti + 2] = b;
        }
        offset += dl * 3;
        wUi(data, offset, crc(data, offset - dl * 3 - 4, dl * 3 + 4));
        offset += 4; // crc

        if (pltAlpha) {
            wUi(data, offset, dl);
            offset += 4;
            wAs(data, offset, 'tRNS');
            offset += 4;
            for (var i = 0; i < dl; i++) data[offset + i] = (nimg.plte[i] >>> 24) & 255;
            offset += dl;
            wUi(data, offset, crc(data, offset - dl - 4, dl + 4));
            offset += 4; // crc
        }
    }

    var fi = 0;
    for (var j = 0; j < nimg.frames.length; j++) {
        var fr = nimg.frames[j];

        var imgd = fr.cimg,
            dl = imgd.length;
        wUi(data, offset, dl + (j == 0 ? 0 : 4));
        offset += 4;
        var ioff = offset;
        wAs(data, offset, j == 0 ? 'IDAT' : 'fdAT');
        offset += 4;
        if (j != 0) {
            wUi(data, offset, fi++);
            offset += 4;
        }
        data.set(imgd, offset);
        offset += dl;
        wUi(data, offset, crc(data, ioff, offset - ioff));
        offset += 4; // crc
    }

    wUi(data, offset, 0);
    offset += 4;
    wAs(data, offset, 'IEND');
    offset += 4;
    wUi(data, offset, crc(data, offset - 4, 4));
    offset += 4; // crc

    return data.buffer;
}
