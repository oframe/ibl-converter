(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined'
        ? factory(exports)
        : typeof define === 'function' && define.amd
        ? define(['exports'], factory)
        : ((global = typeof globalThis !== 'undefined' ? globalThis : global || self), factory((global.pako = {})));
})(this, function (exports) {
    'use strict';

    const Z_FIXED = 4;
    const Z_BINARY = 0;
    const Z_TEXT = 1;
    const Z_UNKNOWN = 2;

    function zero(buf) {
        let len = buf.length;
        while (--len >= 0) {
            buf[len] = 0;
        }
    }

    const STORED_BLOCK = 0;
    const STATIC_TREES = 1;
    const DYN_TREES = 2;
    const MIN_MATCH = 3;
    const MAX_MATCH = 258;
    const LENGTH_CODES = 29;
    const LITERALS = 256;
    const L_CODES = LITERALS + 1 + LENGTH_CODES;
    const D_CODES = 30;
    const BL_CODES = 19;
    const HEAP_SIZE = 2 * L_CODES + 1;
    const MAX_BITS = 15;
    const Buf_size = 16;
    const MAX_BL_BITS = 7;
    const END_BLOCK = 256;
    const REP_3_6 = 16;
    const REPZ_3_10 = 17;
    const REPZ_11_138 = 18;
    const extra_lbits = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]);
    const extra_dbits = new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]);
    const extra_blbits = /* extra bits for each bit length code */ new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]);
    const bl_order = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
    const DIST_CODE_LEN = 512; /* see definition of array dist_code below */

    const static_ltree = new Array((L_CODES + 2) * 2);
    zero(static_ltree);

    const static_dtree = new Array(D_CODES * 2);
    zero(static_dtree);

    const _dist_code = new Array(DIST_CODE_LEN);
    zero(_dist_code);

    const _length_code = new Array(MAX_MATCH - MIN_MATCH + 1);
    zero(_length_code);

    const base_length = new Array(LENGTH_CODES);
    zero(base_length);

    const base_dist = new Array(D_CODES);
    zero(base_dist);

    function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
        this.static_tree = static_tree; /* static tree or NULL */
        this.extra_bits = extra_bits; /* extra bits for each code or NULL */
        this.extra_base = extra_base; /* base index for extra_bits */
        this.elems = elems; /* max number of elements in the tree */
        this.max_length = max_length; /* max bit length for the codes */

        // show if `static_tree` has data or dummy - needed for monomorphic objects
        this.has_stree = static_tree && static_tree.length;
    }

    let static_l_desc;
    let static_d_desc;
    let static_bl_desc;

    function TreeDesc(dyn_tree, stat_desc) {
        this.dyn_tree = dyn_tree; /* the dynamic tree */
        this.max_code = 0; /* largest code with non zero frequency */
        this.stat_desc = stat_desc; /* the corresponding static tree */
    }

    const d_code = (dist) => {};

    const put_short = (s, w) => {
        s.pending_buf[s.pending++] = w & 0xff;
        s.pending_buf[s.pending++] = (w >>> 8) & 0xff;
    };

    const send_bits = (s, value, length) => {
        if (s.bi_valid > Buf_size - length) {
            s.bi_buf |= (value << s.bi_valid) & 0xffff;
            put_short(s, s.bi_buf);
            s.bi_buf = value >> (Buf_size - s.bi_valid);
            s.bi_valid += length - Buf_size;
        } else {
            s.bi_buf |= (value << s.bi_valid) & 0xffff;
            s.bi_valid += length;
        }
    };

    const send_code = (s, c, tree) => {};

    const bi_reverse = (code, len) => {
        let res = 0;
        do {
            res |= code & 1;
            code >>>= 1;
            res <<= 1;
        } while (--len > 0);
        return res >>> 1;
    };

    const bi_flush = (s) => {};

    const gen_codes = (tree, max_code, bl_count) => {
        const next_code = new Array(MAX_BITS + 1); /* next code value for each bit length */
        let code = 0; /* running code value */
        let bits; /* bit index */
        let n; /* code index */

        for (bits = 1; bits <= MAX_BITS; bits++) {
            next_code[bits] = code = (code + bl_count[bits - 1]) << 1;
        }

        for (n = 0; n <= max_code; n++) {
            let len = tree[n * 2 + 1]; /*.Len*/
            if (len === 0) {
                continue;
            }

            tree[n * 2] /*.Code*/ = bi_reverse(next_code[len]++, len);
        }
    };

    const tr_static_init = () => {
        let n; /* iterates over tree elements */
        let bits; /* bit counter */
        let length; /* length value */
        let code; /* code value */
        let dist; /* distance index */
        const bl_count = new Array(MAX_BITS + 1);

        length = 0;
        for (code = 0; code < LENGTH_CODES - 1; code++) {
            base_length[code] = length;
            for (n = 0; n < 1 << extra_lbits[code]; n++) {
                _length_code[length++] = code;
            }
        }

        _length_code[length - 1] = code;

        dist = 0;
        for (code = 0; code < 16; code++) {
            base_dist[code] = dist;
            for (n = 0; n < 1 << extra_dbits[code]; n++) {
                _dist_code[dist++] = code;
            }
        }

        dist >>= 7; /* from now on, all distances are divided by 128 */
        for (; code < D_CODES; code++) {
            base_dist[code] = dist << 7;
            for (n = 0; n < 1 << (extra_dbits[code] - 7); n++) {
                _dist_code[256 + dist++] = code;
            }
        }

        for (bits = 0; bits <= MAX_BITS; bits++) {
            bl_count[bits] = 0;
        }

        n = 0;
        while (n <= 143) {
            static_ltree[n * 2 + 1] /*.Len*/ = 8;
            n++;
            bl_count[8]++;
        }
        while (n <= 255) {
            static_ltree[n * 2 + 1] /*.Len*/ = 9;
            n++;
            bl_count[9]++;
        }
        while (n <= 279) {
            static_ltree[n * 2 + 1] /*.Len*/ = 7;
            n++;
            bl_count[7]++;
        }
        while (n <= 287) {
            static_ltree[n * 2 + 1] /*.Len*/ = 8;
            n++;
            bl_count[8]++;
        }

        gen_codes(static_ltree, L_CODES + 1, bl_count);

        for (n = 0; n < D_CODES; n++) {
            static_dtree[n * 2 + 1] /*.Len*/ = 5;
            static_dtree[n * 2] /*.Code*/ = bi_reverse(n, 5);
        }

        static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
        static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
        static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
    };

    const init_block = (s) => {
        let n; /* iterates over tree elements */

        /* Initialize the trees. */
        for (n = 0; n < L_CODES; n++) {
            s.dyn_ltree[n * 2] /*.Freq*/ = 0;
        }
        for (n = 0; n < D_CODES; n++) {
            s.dyn_dtree[n * 2] /*.Freq*/ = 0;
        }
        for (n = 0; n < BL_CODES; n++) {
            s.bl_tree[n * 2] /*.Freq*/ = 0;
        }

        s.dyn_ltree[END_BLOCK * 2] /*.Freq*/ = 1;
        s.opt_len = s.static_len = 0;
        s.last_lit = s.matches = 0;
    };

    const bi_windup = (s) => {
        if (s.bi_valid > 8) {
            put_short(s, s.bi_buf);
        } else if (s.bi_valid > 0) {
            //put_byte(s, (Byte)s->bi_buf);
            s.pending_buf[s.pending++] = s.bi_buf;
        }
        s.bi_buf = 0;
        s.bi_valid = 0;
    };

    const copy_block = (s, buf, len, header) => {
        bi_windup(s); /* align on byte boundary */

        if (header) {
            put_short(s, len);
            put_short(s, ~len);
        }

        s.pending_buf.set(s.window.subarray(buf, buf + len), s.pending);
        s.pending += len;
    };

    const compress_block = (s, ltree, dtree) => {};

    const build_tree = (s, desc) => {};

    const scan_tree = (s, tree, max_code) => {};

    const send_tree = (s, tree, max_code) => {};

    const build_bl_tree = (s) => {};

    const send_all_trees = (s, lcodes, dcodes, blcodes) => {};

    const detect_data_type = (s) => {};

    let static_init_done = false;

    const _tr_init = (s) => {
        if (!static_init_done) {
            tr_static_init();
            static_init_done = true;
        }

        s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
        s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
        s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);

        s.bi_buf = 0;
        s.bi_valid = 0;

        init_block(s);
    };

    const _tr_stored_block = (s, buf, stored_len, last) => {
        send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3); /* send block type */
        copy_block(s, buf, stored_len, true); /* with header */
    };

    const _tr_align = (s) => {};

    const _tr_flush_block = (s, buf, stored_len, last) => {
        let opt_lenb, static_lenb; /* opt_len and static_len in bytes */
        let max_blindex = 0; /* index of last bit length code of non zero freq */

        /* Build the Huffman trees unless a stored block is forced */
        if (s.level > 0) {
            /* Check if the file is binary or text */
            if (s.strm.data_type === Z_UNKNOWN) {
                s.strm.data_type = detect_data_type(s);
            }

            /* Construct the literal and distance trees */
            build_tree(s, s.l_desc);

            build_tree(s, s.d_desc);

            max_blindex = build_bl_tree(s);

            /* Determine the best encoding. Compute the block lengths in bytes. */
            opt_lenb = (s.opt_len + 3 + 7) >>> 3;
            static_lenb = (s.static_len + 3 + 7) >>> 3;

            if (static_lenb <= opt_lenb) {
                opt_lenb = static_lenb;
            }
        } else {
            opt_lenb = static_lenb = stored_len + 5; /* force a stored block */
        }

        if (stored_len + 4 <= opt_lenb && buf !== -1) {
            _tr_stored_block(s, buf, stored_len, last);
        } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
            send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
            compress_block(s, static_ltree, static_dtree);
        } else {
            send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
            send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
            compress_block(s, s.dyn_ltree, s.dyn_dtree);
        }

        init_block(s);

        if (last) {
            bi_windup(s);
        }
    };

    const _tr_tally = (s, dist, lc) => {};

    var _tr_init_1 = _tr_init;
    var _tr_stored_block_1 = _tr_stored_block;
    var _tr_flush_block_1 = _tr_flush_block;
    var _tr_tally_1 = _tr_tally;
    var _tr_align_1 = _tr_align;

    var trees = {
        _tr_init: _tr_init_1,
        _tr_stored_block: _tr_stored_block_1,
        _tr_flush_block: _tr_flush_block_1,
        _tr_tally: _tr_tally_1,
        _tr_align: _tr_align_1,
    };

    const adler32 = (adler, buf, len, pos) => {
        let s1 = (adler & 0xffff) | 0,
            s2 = ((adler >>> 16) & 0xffff) | 0,
            n = 0;

        while (len !== 0) {
            n = len > 2000 ? 2000 : len;
            len -= n;

            do {
                s1 = (s1 + buf[pos++]) | 0;
                s2 = (s2 + s1) | 0;
            } while (--n);

            s1 %= 65521;
            s2 %= 65521;
        }

        return s1 | (s2 << 16) | 0;
    };

    var adler32_1 = adler32;

    const makeTable = () => {
        let c,
            table = [];

        for (var n = 0; n < 256; n++) {
            c = n;
            for (var k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            table[n] = c;
        }

        return table;
    };

    // Create table on load. Just 255 signed longs. Not a problem.
    const crcTable = new Uint32Array(makeTable());

    const crc32 = (crc, buf, len, pos) => {};

    var crc32_1 = crc32;

    var messages = {
        2: 'need dictionary' /* Z_NEED_DICT       2  */,
        1: 'stream end' /* Z_STREAM_END      1  */,
        0: '' /* Z_OK              0  */,
        '-1': 'file error' /* Z_ERRNO         (-1) */,
        '-2': 'stream error' /* Z_STREAM_ERROR  (-2) */,
        '-3': 'data error' /* Z_DATA_ERROR    (-3) */,
        '-4': 'insufficient memory' /* Z_MEM_ERROR     (-4) */,
        '-5': 'buffer error' /* Z_BUF_ERROR     (-5) */,
        '-6': 'incompatible version' /* Z_VERSION_ERROR (-6) */,
    };

    var constants = {
        Z_NO_FLUSH: 0,
        Z_PARTIAL_FLUSH: 1,
        Z_SYNC_FLUSH: 2,
        Z_FULL_FLUSH: 3,
        Z_FINISH: 4,
        Z_BLOCK: 5,
        Z_TREES: 6,

        Z_OK: 0,
        Z_STREAM_END: 1,
        Z_NEED_DICT: 2,
        Z_ERRNO: -1,
        Z_STREAM_ERROR: -2,
        Z_DATA_ERROR: -3,
        Z_MEM_ERROR: -4,
        Z_BUF_ERROR: -5,
        Z_NO_COMPRESSION: 0,
        Z_BEST_SPEED: 1,
        Z_BEST_COMPRESSION: 9,
        Z_DEFAULT_COMPRESSION: -1,

        Z_FILTERED: 1,
        Z_HUFFMAN_ONLY: 2,
        Z_RLE: 3,
        Z_FIXED: 4,
        Z_DEFAULT_STRATEGY: 0,

        Z_BINARY: 0,
        Z_TEXT: 1,
        Z_UNKNOWN: 2,

        Z_DEFLATED: 8,
    };

    const {
        _tr_init: _tr_init$1,
        _tr_stored_block: _tr_stored_block$1,
        _tr_flush_block: _tr_flush_block$1,
        _tr_tally: _tr_tally$1,
        _tr_align: _tr_align$1,
    } = trees;

    const {
        Z_NO_FLUSH,
        Z_PARTIAL_FLUSH,
        Z_FULL_FLUSH,
        Z_FINISH,
        Z_BLOCK,
        Z_OK,
        Z_STREAM_END,
        Z_STREAM_ERROR,
        Z_DATA_ERROR,
        Z_BUF_ERROR,
        Z_DEFAULT_COMPRESSION,
        Z_FILTERED,
        Z_HUFFMAN_ONLY,
        Z_RLE,
        Z_FIXED: Z_FIXED$1,
        Z_DEFAULT_STRATEGY,
        Z_UNKNOWN: Z_UNKNOWN$1,
        Z_DEFLATED,
    } = constants;

    const MAX_MEM_LEVEL = 9;
    /* Maximum value for memLevel in deflateInit2 */
    const MAX_WBITS = 15;
    /* 32K LZ77 window */
    const DEF_MEM_LEVEL = 8;

    const LENGTH_CODES$1 = 29;
    /* number of length codes, not counting the special END_BLOCK code */
    const LITERALS$1 = 256;
    /* number of literal bytes 0..255 */
    const L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1;
    /* number of Literal or Length codes, including the END_BLOCK code */
    const D_CODES$1 = 30;
    /* number of distance codes */
    const BL_CODES$1 = 19;
    /* number of codes used to transfer the bit lengths */
    const HEAP_SIZE$1 = 2 * L_CODES$1 + 1;
    /* maximum heap size */
    const MAX_BITS$1 = 15;
    /* All codes must not exceed MAX_BITS bits */

    const MIN_MATCH$1 = 3;
    const MAX_MATCH$1 = 258;
    const MIN_LOOKAHEAD = MAX_MATCH$1 + MIN_MATCH$1 + 1;

    const PRESET_DICT = 0x20;

    const INIT_STATE = 42;
    const EXTRA_STATE = 69;
    const NAME_STATE = 73;
    const COMMENT_STATE = 91;
    const HCRC_STATE = 103;
    const BUSY_STATE = 113;
    const FINISH_STATE = 666;

    const BS_NEED_MORE = 1; /* block not completed, need more input or more output */
    const BS_BLOCK_DONE = 2; /* block flush performed */
    const BS_FINISH_STARTED = 3; /* finish started, need only more output at next deflate */
    const BS_FINISH_DONE = 4; /* finish done, accept no more input or output */

    const OS_CODE = 0x03; // Unix :) . Don't detect, use this default.

    const err = (strm, errorCode) => {
        strm.msg = messages[errorCode];
        return errorCode;
    };

    const rank = (f) => {
        return (f << 1) - (f > 4 ? 9 : 0);
    };

    const zero$1 = (buf) => {
        let len = buf.length;
        while (--len >= 0) {
            buf[len] = 0;
        }
    };

    let HASH_ZLIB = (s, prev, data) => ((prev << s.hash_shift) ^ data) & s.hash_mask;

    let HASH = HASH_ZLIB;

    const flush_pending = (strm) => {
        const s = strm.state;

        //_tr_flush_bits(s);
        let len = s.pending;
        if (len > strm.avail_out) {
            len = strm.avail_out;
        }
        if (len === 0) {
            return;
        }

        strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
        strm.next_out += len;
        s.pending_out += len;
        strm.total_out += len;
        strm.avail_out -= len;
        s.pending -= len;
        if (s.pending === 0) {
            s.pending_out = 0;
        }
    };

    const flush_block_only = (s, last) => {
        _tr_flush_block$1(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
        s.block_start = s.strstart;
        flush_pending(s.strm);
    };

    const put_byte = (s, b) => {
        s.pending_buf[s.pending++] = b;
    };

    const putShortMSB = (s, b) => {
        s.pending_buf[s.pending++] = (b >>> 8) & 0xff;
        s.pending_buf[s.pending++] = b & 0xff;
    };

    const read_buf = (strm, buf, start, size) => {
        let len = strm.avail_in;

        if (len > size) {
            len = size;
        }
        if (len === 0) {
            return 0;
        }

        strm.avail_in -= len;

        // zmemcpy(buf, strm->next_in, len);
        buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);
        if (strm.state.wrap === 1) {
            strm.adler = adler32_1(strm.adler, buf, len, start);
        } else if (strm.state.wrap === 2) {
            strm.adler = crc32_1(strm.adler, buf, len, start);
        }

        strm.next_in += len;
        strm.total_in += len;

        return len;
    };

    const fill_window = (s) => {
        const _w_size = s.w_size;
        let p, n, m, more, str;

        do {
            more = s.window_size - s.lookahead - s.strstart;

            if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
                s.window.set(s.window.subarray(_w_size, _w_size + _w_size), 0);
                s.match_start -= _w_size;
                s.strstart -= _w_size;
                /* we now have strstart >= MAX_DIST */
                s.block_start -= _w_size;

                n = s.hash_size;
                p = n;

                do {
                    m = s.head[--p];
                    s.head[p] = m >= _w_size ? m - _w_size : 0;
                } while (--n);

                n = _w_size;
                p = n;

                do {
                    m = s.prev[--p];
                    s.prev[p] = m >= _w_size ? m - _w_size : 0;
                } while (--n);

                more += _w_size;
            }
            if (s.strm.avail_in === 0) {
                break;
            }

            n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
            s.lookahead += n;

            if (s.lookahead + s.insert >= MIN_MATCH$1) {
                str = s.strstart - s.insert;
                s.ins_h = s.window[str];

                s.ins_h = HASH(s, s.ins_h, s.window[str + 1]);

                while (s.insert) {
                    /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
                    s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH$1 - 1]);

                    s.prev[str & s.w_mask] = s.head[s.ins_h];
                    s.head[s.ins_h] = str;
                    str++;
                    s.insert--;
                    if (s.lookahead + s.insert < MIN_MATCH$1) {
                        break;
                    }
                }
            }
        } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
    };

    const deflate_stored = (s, flush) => {
        let max_block_size = 0xffff;

        if (max_block_size > s.pending_buf_size - 5) {
            max_block_size = s.pending_buf_size - 5;
        }

        for (;;) {
            if (s.lookahead <= 1) {
                fill_window(s);
                if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
                    return BS_NEED_MORE;
                }

                if (s.lookahead === 0) {
                    break;
                }
                /* flush the current block */
            }

            s.strstart += s.lookahead;
            s.lookahead = 0;

            /* Emit a stored block if pending_buf will be full: */
            const max_start = s.block_start + max_block_size;

            if (s.strstart === 0 || s.strstart >= max_start) {
                /* strstart == 0 is possible when wraparound on 16-bit machine */
                s.lookahead = s.strstart - max_start;
                s.strstart = max_start;
                /*** FLUSH_BLOCK(s, 0); ***/
                flush_block_only(s, false);
                if (s.strm.avail_out === 0) {
                    return BS_NEED_MORE;
                }
                /***/
            }

            if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
                /*** FLUSH_BLOCK(s, 0); ***/
                flush_block_only(s, false);
                if (s.strm.avail_out === 0) {
                    return BS_NEED_MORE;
                }
                /***/
            }
        }

        s.insert = 0;

        if (flush === Z_FINISH) {
            /*** FLUSH_BLOCK(s, 1); ***/
            flush_block_only(s, true);
            if (s.strm.avail_out === 0) {
                return BS_FINISH_STARTED;
            }
            /***/
            return BS_FINISH_DONE;
        }

        if (s.strstart > s.block_start) {
            /*** FLUSH_BLOCK(s, 0); ***/
            flush_block_only(s, false);
            if (s.strm.avail_out === 0) {
                return BS_NEED_MORE;
            }
            /***/
        }

        return BS_NEED_MORE;
    };

    const deflate_fast = (s, flush) => {};

    const deflate_slow = (s, flush) => {};

    const deflate_rle = (s, flush) => {};

    const deflate_huff = (s, flush) => {};

    function Config(good_length, max_lazy, nice_length, max_chain, func) {
        this.good_length = good_length;
        this.max_lazy = max_lazy;
        this.nice_length = nice_length;
        this.max_chain = max_chain;
        this.func = func;
    }

    const configuration_table = [
        /*      good lazy nice chain */
        new Config(0, 0, 0, 0, deflate_stored) /* 0 store only */,
        new Config(4, 4, 8, 4, deflate_fast) /* 1 max speed, no lazy matches */,
        new Config(4, 5, 16, 8, deflate_fast) /* 2 */,
        new Config(4, 6, 32, 32, deflate_fast) /* 3 */,

        new Config(4, 4, 16, 16, deflate_slow) /* 4 lazy matches */,
        new Config(8, 16, 32, 32, deflate_slow) /* 5 */,
        new Config(8, 16, 128, 128, deflate_slow) /* 6 */,
        new Config(8, 32, 128, 256, deflate_slow) /* 7 */,
        new Config(32, 128, 258, 1024, deflate_slow) /* 8 */,
        new Config(32, 258, 258, 4096, deflate_slow) /* 9 max compression */,
    ];

    const lm_init = (s) => {
        s.window_size = 2 * s.w_size;

        zero$1(s.head); // Fill with NIL (= 0);

        s.max_lazy_match = configuration_table[s.level].max_lazy;
        s.good_match = configuration_table[s.level].good_length;
        s.nice_match = configuration_table[s.level].nice_length;
        s.max_chain_length = configuration_table[s.level].max_chain;

        s.strstart = 0;
        s.block_start = 0;
        s.lookahead = 0;
        s.insert = 0;
        s.match_length = s.prev_length = MIN_MATCH$1 - 1;
        s.match_available = 0;
        s.ins_h = 0;
    };

    function DeflateState() {
        this.strm = null; /* pointer back to this zlib stream */
        this.status = 0; /* as the name implies */
        this.pending_buf = null; /* output still pending */
        this.pending_buf_size = 0; /* size of pending_buf */
        this.pending_out = 0; /* next pending byte to output to the stream */
        this.pending = 0; /* nb of bytes in the pending buffer */
        this.wrap = 0; /* bit 0 true for zlib, bit 1 true for gzip */
        this.gzhead = null; /* gzip header information to write */
        this.gzindex = 0; /* where in extra, name, or comment */
        this.method = Z_DEFLATED; /* can only be DEFLATED */
        this.last_flush = -1; /* value of flush param for previous deflate call */

        this.w_size = 0; /* LZ77 window size (32K by default) */
        this.w_bits = 0; /* log2(w_size)  (8..16) */
        this.w_mask = 0; /* w_size - 1 */

        this.window = null;

        this.window_size = 0;

        this.prev = null;

        this.head = null; /* Heads of the hash chains or NIL. */

        this.ins_h = 0; /* hash index of string to be inserted */
        this.hash_size = 0; /* number of elements in hash table */
        this.hash_bits = 0; /* log2(hash_size) */
        this.hash_mask = 0; /* hash_size-1 */

        this.hash_shift = 0;

        this.block_start = 0;

        this.match_length = 0; /* length of best match */
        this.prev_match = 0; /* previous match */
        this.match_available = 0; /* set if previous match exists */
        this.strstart = 0; /* start of string to insert */
        this.match_start = 0; /* start of matching string */
        this.lookahead = 0; /* number of valid bytes ahead in window */

        this.prev_length = 0;

        this.max_chain_length = 0;

        this.max_lazy_match = 0;

        this.level = 0; /* compression level (1..9) */
        this.strategy = 0; /* favor or force Huffman coding*/

        this.good_match = 0;
        /* Use a faster search when the previous match is longer than this */

        this.nice_match = 0; /* Stop searching when current match exceeds this */

        this.dyn_ltree = new Uint16Array(HEAP_SIZE$1 * 2);
        this.dyn_dtree = new Uint16Array((2 * D_CODES$1 + 1) * 2);
        this.bl_tree = new Uint16Array((2 * BL_CODES$1 + 1) * 2);
        zero$1(this.dyn_ltree);
        zero$1(this.dyn_dtree);
        zero$1(this.bl_tree);

        this.l_desc = null; /* desc. for literal tree */
        this.d_desc = null; /* desc. for distance tree */
        this.bl_desc = null; /* desc. for bit length tree */

        //ush bl_count[MAX_BITS+1];
        this.bl_count = new Uint16Array(MAX_BITS$1 + 1);

        this.heap = new Uint16Array(2 * L_CODES$1 + 1); /* heap used to build the Huffman trees */
        zero$1(this.heap);

        this.heap_len = 0; /* number of elements in the heap */
        this.heap_max = 0; /* element of largest frequency */

        this.depth = new Uint16Array(2 * L_CODES$1 + 1); //uch depth[2*L_CODES+1];
        zero$1(this.depth);

        this.l_buf = 0; /* buffer index for literals or lengths */

        this.lit_bufsize = 0;

        this.last_lit = 0; /* running index in l_buf */

        this.d_buf = 0;

        this.opt_len = 0; /* bit length of current block with optimal trees */
        this.static_len = 0; /* bit length of current block with static trees */
        this.matches = 0; /* number of string matches in current block */
        this.insert = 0; /* bytes at end of window left to insert */

        this.bi_buf = 0;

        this.bi_valid = 0;
    }

    const deflateResetKeep = (strm) => {
        if (!strm || !strm.state) {
            return err(strm, Z_STREAM_ERROR);
        }

        strm.total_in = strm.total_out = 0;
        strm.data_type = Z_UNKNOWN$1;

        const s = strm.state;
        s.pending = 0;
        s.pending_out = 0;

        if (s.wrap < 0) {
            s.wrap = -s.wrap;
            /* was made negative by deflate(..., Z_FINISH); */
        }
        s.status = s.wrap ? INIT_STATE : BUSY_STATE;
        strm.adler =
            s.wrap === 2
                ? 0 // crc32(0, Z_NULL, 0)
                : 1; // adler32(0, Z_NULL, 0)
        s.last_flush = Z_NO_FLUSH;
        _tr_init$1(s);
        return Z_OK;
    };

    const deflateReset = (strm) => {
        const ret = deflateResetKeep(strm);
        if (ret === Z_OK) {
            lm_init(strm.state);
        }
        return ret;
    };

    const deflateSetHeader = (strm, head) => {};

    const deflateInit2 = (strm, level, method, windowBits, memLevel, strategy) => {
        if (!strm) {
            // === Z_NULL
            return Z_STREAM_ERROR;
        }
        let wrap = 1;

        if (level === Z_DEFAULT_COMPRESSION) {
            level = 6;
        }

        if (windowBits < 0) {
            /* suppress zlib wrapper */
            wrap = 0;
            windowBits = -windowBits;
        } else if (windowBits > 15) {
            wrap = 2; /* write gzip wrapper instead */
            windowBits -= 16;
        }

        if (
            memLevel < 1 ||
            memLevel > MAX_MEM_LEVEL ||
            method !== Z_DEFLATED ||
            windowBits < 8 ||
            windowBits > 15 ||
            level < 0 ||
            level > 9 ||
            strategy < 0 ||
            strategy > Z_FIXED$1
        ) {
            return err(strm, Z_STREAM_ERROR);
        }

        if (windowBits === 8) {
            windowBits = 9;
        }
        /* until 256-byte window bug fixed */

        const s = new DeflateState();

        strm.state = s;
        s.strm = strm;

        s.wrap = wrap;
        s.gzhead = null;
        s.w_bits = windowBits;
        s.w_size = 1 << s.w_bits;
        s.w_mask = s.w_size - 1;

        s.hash_bits = memLevel + 7;
        s.hash_size = 1 << s.hash_bits;
        s.hash_mask = s.hash_size - 1;
        s.hash_shift = ~~((s.hash_bits + MIN_MATCH$1 - 1) / MIN_MATCH$1);

        s.window = new Uint8Array(s.w_size * 2);
        s.head = new Uint16Array(s.hash_size);
        s.prev = new Uint16Array(s.w_size);

        s.lit_bufsize = 1 << (memLevel + 6); /* 16K elements by default */

        s.pending_buf_size = s.lit_bufsize * 4;

        s.pending_buf = new Uint8Array(s.pending_buf_size);

        s.d_buf = 1 * s.lit_bufsize;

        //s->l_buf = s->pending_buf + (1+sizeof(ush))*s->lit_bufsize;
        s.l_buf = (1 + 2) * s.lit_bufsize;

        s.level = level;
        s.strategy = strategy;
        s.method = method;

        return deflateReset(strm);
    };

    const deflateInit = (strm, level) => {
        return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
    };

    const deflate = (strm, flush) => {
        let beg, val; // for gzip header write only

        if (!strm || !strm.state || flush > Z_BLOCK || flush < 0) {
            return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
        }

        const s = strm.state;

        if (!strm.output || (!strm.input && strm.avail_in !== 0) || (s.status === FINISH_STATE && flush !== Z_FINISH)) {
            return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR : Z_STREAM_ERROR);
        }

        s.strm = strm; /* just in case */
        const old_flush = s.last_flush;
        s.last_flush = flush;

        /* Write the header */
        if (s.status === INIT_STATE) {
            if (s.wrap === 2) {
                // GZIP header
                strm.adler = 0; //crc32(0L, Z_NULL, 0);
                put_byte(s, 31);
                put_byte(s, 139);
                put_byte(s, 8);
                if (!s.gzhead) {
                    // s->gzhead == Z_NULL
                    put_byte(s, 0);
                    put_byte(s, 0);
                    put_byte(s, 0);
                    put_byte(s, 0);
                    put_byte(s, 0);
                    put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
                    put_byte(s, OS_CODE);
                    s.status = BUSY_STATE;
                } else {
                    put_byte(
                        s,
                        (s.gzhead.text ? 1 : 0) +
                            (s.gzhead.hcrc ? 2 : 0) +
                            (!s.gzhead.extra ? 0 : 4) +
                            (!s.gzhead.name ? 0 : 8) +
                            (!s.gzhead.comment ? 0 : 16)
                    );
                    put_byte(s, s.gzhead.time & 0xff);
                    put_byte(s, (s.gzhead.time >> 8) & 0xff);
                    put_byte(s, (s.gzhead.time >> 16) & 0xff);
                    put_byte(s, (s.gzhead.time >> 24) & 0xff);
                    put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
                    put_byte(s, s.gzhead.os & 0xff);
                    if (s.gzhead.extra && s.gzhead.extra.length) {
                        put_byte(s, s.gzhead.extra.length & 0xff);
                        put_byte(s, (s.gzhead.extra.length >> 8) & 0xff);
                    }
                    if (s.gzhead.hcrc) {
                        strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending, 0);
                    }
                    s.gzindex = 0;
                    s.status = EXTRA_STATE;
                }
            } // DEFLATE header
            else {
                let header = (Z_DEFLATED + ((s.w_bits - 8) << 4)) << 8;
                let level_flags = -1;

                if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
                    level_flags = 0;
                } else if (s.level < 6) {
                    level_flags = 1;
                } else if (s.level === 6) {
                    level_flags = 2;
                } else {
                    level_flags = 3;
                }
                header |= level_flags << 6;
                if (s.strstart !== 0) {
                    header |= PRESET_DICT;
                }
                header += 31 - (header % 31);

                s.status = BUSY_STATE;
                putShortMSB(s, header);

                /* Save the adler32 of the preset dictionary: */
                if (s.strstart !== 0) {
                    putShortMSB(s, strm.adler >>> 16);
                    putShortMSB(s, strm.adler & 0xffff);
                }
                strm.adler = 1; // adler32(0L, Z_NULL, 0);
            }
        }

        //#ifdef GZIP
        if (s.status === EXTRA_STATE) {
            if (s.gzhead.extra /* != Z_NULL*/) {
                beg = s.pending; /* start of bytes to update crc */

                while (s.gzindex < (s.gzhead.extra.length & 0xffff)) {
                    if (s.pending === s.pending_buf_size) {
                        if (s.gzhead.hcrc && s.pending > beg) {
                            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
                        }
                        flush_pending(strm);
                        beg = s.pending;
                        if (s.pending === s.pending_buf_size) {
                            break;
                        }
                    }
                    put_byte(s, s.gzhead.extra[s.gzindex] & 0xff);
                    s.gzindex++;
                }
                if (s.gzhead.hcrc && s.pending > beg) {
                    strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
                }
                if (s.gzindex === s.gzhead.extra.length) {
                    s.gzindex = 0;
                    s.status = NAME_STATE;
                }
            } else {
                s.status = NAME_STATE;
            }
        }
        if (s.status === NAME_STATE) {
            if (s.gzhead.name /* != Z_NULL*/) {
                beg = s.pending; /* start of bytes to update crc */
                //int val;

                do {
                    if (s.pending === s.pending_buf_size) {
                        if (s.gzhead.hcrc && s.pending > beg) {
                            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
                        }
                        flush_pending(strm);
                        beg = s.pending;
                        if (s.pending === s.pending_buf_size) {
                            val = 1;
                            break;
                        }
                    }
                    // JS specific: little magic to add zero terminator to end of string
                    if (s.gzindex < s.gzhead.name.length) {
                        val = s.gzhead.name.charCodeAt(s.gzindex++) & 0xff;
                    } else {
                        val = 0;
                    }
                    put_byte(s, val);
                } while (val !== 0);

                if (s.gzhead.hcrc && s.pending > beg) {
                    strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
                }
                if (val === 0) {
                    s.gzindex = 0;
                    s.status = COMMENT_STATE;
                }
            } else {
                s.status = COMMENT_STATE;
            }
        }
        if (s.status === COMMENT_STATE) {
            if (s.gzhead.comment /* != Z_NULL*/) {
                beg = s.pending; /* start of bytes to update crc */
                //int val;

                do {
                    if (s.pending === s.pending_buf_size) {
                        if (s.gzhead.hcrc && s.pending > beg) {
                            strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
                        }
                        flush_pending(strm);
                        beg = s.pending;
                        if (s.pending === s.pending_buf_size) {
                            val = 1;
                            break;
                        }
                    }
                    // JS specific: little magic to add zero terminator to end of string
                    if (s.gzindex < s.gzhead.comment.length) {
                        val = s.gzhead.comment.charCodeAt(s.gzindex++) & 0xff;
                    } else {
                        val = 0;
                    }
                    put_byte(s, val);
                } while (val !== 0);

                if (s.gzhead.hcrc && s.pending > beg) {
                    strm.adler = crc32_1(strm.adler, s.pending_buf, s.pending - beg, beg);
                }
                if (val === 0) {
                    s.status = HCRC_STATE;
                }
            } else {
                s.status = HCRC_STATE;
            }
        }
        if (s.status === HCRC_STATE) {
            if (s.gzhead.hcrc) {
                if (s.pending + 2 > s.pending_buf_size) {
                    flush_pending(strm);
                }
                if (s.pending + 2 <= s.pending_buf_size) {
                    put_byte(s, strm.adler & 0xff);
                    put_byte(s, (strm.adler >> 8) & 0xff);
                    strm.adler = 0; //crc32(0L, Z_NULL, 0);
                    s.status = BUSY_STATE;
                }
            } else {
                s.status = BUSY_STATE;
            }
        }

        if (s.pending !== 0) {
            flush_pending(strm);
            if (strm.avail_out === 0) {
                s.last_flush = -1;
                return Z_OK;
            }
        } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH) {
            return err(strm, Z_BUF_ERROR);
        }

        /* User must not provide more input after the first FINISH: */
        if (s.status === FINISH_STATE && strm.avail_in !== 0) {
            return err(strm, Z_BUF_ERROR);
        }

        /* Start a new block or continue the current one.
         */
        if (strm.avail_in !== 0 || s.lookahead !== 0 || (flush !== Z_NO_FLUSH && s.status !== FINISH_STATE)) {
            let bstate =
                s.strategy === Z_HUFFMAN_ONLY
                    ? deflate_huff(s, flush)
                    : s.strategy === Z_RLE
                    ? deflate_rle(s, flush)
                    : configuration_table[s.level].func(s, flush);

            if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
                s.status = FINISH_STATE;
            }
            if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
                if (strm.avail_out === 0) {
                    s.last_flush = -1;
                    /* avoid BUF_ERROR next call, see above */
                }
                return Z_OK;
            }
            if (bstate === BS_BLOCK_DONE) {
                if (flush === Z_PARTIAL_FLUSH) {
                    _tr_align$1(s);
                } else if (flush !== Z_BLOCK) {
                    _tr_stored_block$1(s, 0, 0, false);

                    if (flush === Z_FULL_FLUSH) {
                        /*** CLEAR_HASH(s); ***/ /* forget history */
                        zero$1(s.head); // Fill with NIL (= 0);

                        if (s.lookahead === 0) {
                            s.strstart = 0;
                            s.block_start = 0;
                            s.insert = 0;
                        }
                    }
                }
                flush_pending(strm);
                if (strm.avail_out === 0) {
                    s.last_flush = -1; /* avoid BUF_ERROR at next call, see above */
                    return Z_OK;
                }
            }
        }

        if (flush !== Z_FINISH) {
            return Z_OK;
        }
        if (s.wrap <= 0) {
            return Z_STREAM_END;
        }

        /* Write the trailer */
        if (s.wrap === 2) {
            put_byte(s, strm.adler & 0xff);
            put_byte(s, (strm.adler >> 8) & 0xff);
            put_byte(s, (strm.adler >> 16) & 0xff);
            put_byte(s, (strm.adler >> 24) & 0xff);
            put_byte(s, strm.total_in & 0xff);
            put_byte(s, (strm.total_in >> 8) & 0xff);
            put_byte(s, (strm.total_in >> 16) & 0xff);
            put_byte(s, (strm.total_in >> 24) & 0xff);
        } else {
            putShortMSB(s, strm.adler >>> 16);
            putShortMSB(s, strm.adler & 0xffff);
        }

        flush_pending(strm);

        if (s.wrap > 0) {
            s.wrap = -s.wrap;
        }
        /* write the trailer only once! */
        return s.pending !== 0 ? Z_OK : Z_STREAM_END;
    };

    const deflateEnd = (strm) => {
        if (!strm /*== Z_NULL*/ || !strm.state /*== Z_NULL*/) {
            return Z_STREAM_ERROR;
        }

        const status = strm.state.status;
        if (
            status !== INIT_STATE &&
            status !== EXTRA_STATE &&
            status !== NAME_STATE &&
            status !== COMMENT_STATE &&
            status !== HCRC_STATE &&
            status !== BUSY_STATE &&
            status !== FINISH_STATE
        ) {
            return err(strm, Z_STREAM_ERROR);
        }

        strm.state = null;

        return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
    };

    const deflateSetDictionary = (strm, dictionary) => {};

    var deflateInit_1 = deflateInit;
    var deflateInit2_1 = deflateInit2;
    var deflateReset_1 = deflateReset;
    var deflateResetKeep_1 = deflateResetKeep;
    var deflateSetHeader_1 = deflateSetHeader;
    var deflate_2 = deflate;
    var deflateEnd_1 = deflateEnd;
    var deflateSetDictionary_1 = deflateSetDictionary;
    var deflateInfo = 'pako deflate (from Nodeca project)';

    var deflate_1 = {
        deflateInit: deflateInit_1,
        deflateInit2: deflateInit2_1,
        deflateReset: deflateReset_1,
        deflateResetKeep: deflateResetKeep_1,
        deflateSetHeader: deflateSetHeader_1,
        deflate: deflate_2,
        deflateEnd: deflateEnd_1,
        deflateSetDictionary: deflateSetDictionary_1,
        deflateInfo: deflateInfo,
    };

    const _has = (obj, key) => {
        return Object.prototype.hasOwnProperty.call(obj, key);
    };

    var assign = function (obj /*from1, from2, from3, ...*/) {
        const sources = Array.prototype.slice.call(arguments, 1);
        while (sources.length) {
            const source = sources.shift();
            if (!source) {
                continue;
            }

            if (typeof source !== 'object') {
                throw new TypeError(source + 'must be non-object');
            }

            for (const p in source) {
                if (_has(source, p)) {
                    obj[p] = source[p];
                }
            }
        }

        return obj;
    };

    // Join array of chunks to single array.
    var flattenChunks = (chunks) => {
        // calculate data length
        let len = 0;

        for (let i = 0, l = chunks.length; i < l; i++) {
            len += chunks[i].length;
        }

        // join chunks
        const result = new Uint8Array(len);

        for (let i = 0, pos = 0, l = chunks.length; i < l; i++) {
            let chunk = chunks[i];
            result.set(chunk, pos);
            pos += chunk.length;
        }

        return result;
    };

    var common = {
        assign: assign,
        flattenChunks: flattenChunks,
    };

    let STR_APPLY_UIA_OK = true;

    try {
        String.fromCharCode.apply(null, new Uint8Array(1));
    } catch (__) {
        STR_APPLY_UIA_OK = false;
    }

    const _utf8len = new Uint8Array(256);
    for (let q = 0; q < 256; q++) {
        _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
    }
    _utf8len[254] = _utf8len[254] = 1; // Invalid sequence start

    // convert string to array (typed, when possible)
    var string2buf = (str) => {};

    // convert array to string
    var buf2string = (buf, max) => {};

    var utf8border = (buf, max) => {};

    var strings = {
        string2buf: string2buf,
        buf2string: buf2string,
        utf8border: utf8border,
    };

    function ZStream() {
        /* next input byte */
        this.input = null; // JS specific, because we have no pointers
        this.next_in = 0;
        /* number of bytes available at input */
        this.avail_in = 0;
        /* total number of input bytes read so far */
        this.total_in = 0;
        /* next output byte should be put there */
        this.output = null; // JS specific, because we have no pointers
        this.next_out = 0;
        /* remaining free space at output */
        this.avail_out = 0;
        /* total number of bytes output so far */
        this.total_out = 0;
        this.msg = '' /*Z_NULL*/;
        this.state = null;
        this.data_type = 2 /*Z_UNKNOWN*/;
        this.adler = 0;
    }

    var zstream = ZStream;

    const toString = Object.prototype.toString;

    const {
        Z_NO_FLUSH: Z_NO_FLUSH$1,
        Z_SYNC_FLUSH,
        Z_FULL_FLUSH: Z_FULL_FLUSH$1,
        Z_FINISH: Z_FINISH$1,
        Z_OK: Z_OK$1,
        Z_STREAM_END: Z_STREAM_END$1,
        Z_DEFAULT_COMPRESSION: Z_DEFAULT_COMPRESSION$1,
        Z_DEFAULT_STRATEGY: Z_DEFAULT_STRATEGY$1,
        Z_DEFLATED: Z_DEFLATED$1,
    } = constants;

    function Deflate(options) {
        this.options = common.assign(
            {
                level: Z_DEFAULT_COMPRESSION$1,
                method: Z_DEFLATED$1,
                chunkSize: 16384,
                windowBits: 15,
                memLevel: 8,
                strategy: Z_DEFAULT_STRATEGY$1,
            },
            options || {}
        );

        let opt = this.options;

        if (opt.raw && opt.windowBits > 0) {
            opt.windowBits = -opt.windowBits;
        } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
            opt.windowBits += 16;
        }

        this.err = 0; // error code, if happens (0 = Z_OK)
        this.msg = ''; // error message
        this.ended = false; // used to avoid multiple onEnd() calls
        this.chunks = []; // chunks of compressed data

        this.strm = new zstream();
        this.strm.avail_out = 0;

        let status = deflate_1.deflateInit2(this.strm, opt.level, opt.method, opt.windowBits, opt.memLevel, opt.strategy);

        if (status !== Z_OK$1) {
            throw new Error(messages[status]);
        }

        if (opt.header) {
            deflate_1.deflateSetHeader(this.strm, opt.header);
        }

        if (opt.dictionary) {
            let dict;
            // Convert data if needed
            if (typeof opt.dictionary === 'string') {
                // If we need to compress text, change encoding to utf8.
                dict = strings.string2buf(opt.dictionary);
            } else if (toString.call(opt.dictionary) === '[object ArrayBuffer]') {
                dict = new Uint8Array(opt.dictionary);
            } else {
                dict = opt.dictionary;
            }

            status = deflate_1.deflateSetDictionary(this.strm, dict);

            if (status !== Z_OK$1) {
                throw new Error(messages[status]);
            }

            this._dict_set = true;
        }
    }

    Deflate.prototype.push = function (data, flush_mode) {
        const strm = this.strm;
        const chunkSize = this.options.chunkSize;
        let status, _flush_mode;

        if (this.ended) {
            return false;
        }

        if (flush_mode === ~~flush_mode) _flush_mode = flush_mode;
        else _flush_mode = flush_mode === true ? Z_FINISH$1 : Z_NO_FLUSH$1;

        // Convert data if needed
        if (typeof data === 'string') {
            // If we need to compress text, change encoding to utf8.
            strm.input = strings.string2buf(data);
        } else if (toString.call(data) === '[object ArrayBuffer]') {
            strm.input = new Uint8Array(data);
        } else {
            strm.input = data;
        }

        strm.next_in = 0;
        strm.avail_in = strm.input.length;

        for (;;) {
            if (strm.avail_out === 0) {
                strm.output = new Uint8Array(chunkSize);
                strm.next_out = 0;
                strm.avail_out = chunkSize;
            }

            // Make sure avail_out > 6 to avoid repeating markers
            if ((_flush_mode === Z_SYNC_FLUSH || _flush_mode === Z_FULL_FLUSH$1) && strm.avail_out <= 6) {
                this.onData(strm.output.subarray(0, strm.next_out));
                strm.avail_out = 0;
                continue;
            }

            status = deflate_1.deflate(strm, _flush_mode);

            // Ended => flush and finish
            if (status === Z_STREAM_END$1) {
                if (strm.next_out > 0) {
                    this.onData(strm.output.subarray(0, strm.next_out));
                }
                status = deflate_1.deflateEnd(this.strm);
                this.onEnd(status);
                this.ended = true;
                return status === Z_OK$1;
            }

            // Flush if out buffer full
            if (strm.avail_out === 0) {
                this.onData(strm.output);
                continue;
            }

            // Flush if requested and has data
            if (_flush_mode > 0 && strm.next_out > 0) {
                this.onData(strm.output.subarray(0, strm.next_out));
                strm.avail_out = 0;
                continue;
            }

            if (strm.avail_in === 0) break;
        }

        return true;
    };

    Deflate.prototype.onData = function (chunk) {
        this.chunks.push(chunk);
    };

    Deflate.prototype.onEnd = function (status) {
        // On success - join
        if (status === Z_OK$1) {
            this.result = common.flattenChunks(this.chunks);
        }
        this.chunks = [];
        this.err = status;
        this.msg = this.strm.msg;
    };

    function deflate$1(input, options) {
        const deflator = new Deflate(options);

        deflator.push(input, true);

        if (deflator.err) {
            throw deflator.msg || messages[deflator.err];
        }

        return deflator.result;
    }

    var Deflate_1 = Deflate;
    var deflate_2$1 = deflate$1;

    var constants$1 = constants;

    var deflate_1$1 = {
        Deflate: Deflate_1,
        deflate: deflate_2$1,

        constants: constants$1,
    };

    exports.Deflate = Deflate_1;
    exports.constants = constants$1;
    exports.default = deflate_1$1;
    exports.deflate = deflate_2$1;

    Object.defineProperty(exports, '__esModule', { value: true });
});
