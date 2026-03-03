"use strict";

// Helper class to generate WebAssembly binary code.
class WasmEmitter {
    static OP = {
        // Control flow
        block: 0x02,
        loop: 0x03,
        if: 0x04,
        else: 0x05,
        end: 0x0b,
        br: 0x0c,
        br_if: 0x0d,
        return: 0x0f,
        call: 0x10,
        drop: 0x1a,

        // Variable access
        local_get: 0x20,
        local_set: 0x21,
        local_tee: 0x22,
        global_get: 0x23,
        global_set: 0x24,

        // Memory
        i32_load: 0x28,
        i32_store: 0x36,

        // I32 Constants
        i32_const: 0x41,

        // I32 Comparison
        i32_eqz: 0x45,
        i32_eq: 0x46,
        i32_ne: 0x47,
        i32_lt_s: 0x48,
        i32_lt_u: 0x49,
        i32_gt_s: 0x4a,
        i32_gt_u: 0x4b,
        i32_le_s: 0x4c,
        i32_le_u: 0x4d,
        i32_ge_s: 0x4e,
        i32_ge_u: 0x4f,

        // I32 Numeric
        i32_clz: 0x67,
        i32_ctz: 0x68,
        i32_popcnt: 0x69,
        i32_add: 0x6a,
        i32_sub: 0x6b,
        i32_mul: 0x6c,
        i32_div_s: 0x6d,
        i32_div_u: 0x6e,
        i32_rem_s: 0x6f,
        i32_rem_u: 0x70,
        i32_and: 0x71,
        i32_or: 0x72,
        i32_xor: 0x73,
        i32_shl: 0x74,
        i32_shr_s: 0x75,
        i32_shr_u: 0x76,
        i32_rotl: 0x77,
        i32_rotr: 0x78,

        // SIMD (prefix 0xfd)
        v128_load: 0x00,
        v128_store: 0x0b,
        v128_const: 0x0c,
        i8x16_shuffle: 0x0d,
        i8x16_swizzle: 0x0e,
        i8x16_splat: 0x0f,
        i16x8_splat: 0x10,
        i32x4_splat: 0x11,
        i64x2_splat: 0x12,
        v128_not: 0x4d,
        v128_and: 0x4e,
        v128_andnot: 0x4f,
        v128_or: 0x50,
        v128_xor: 0x51,
        v128_bitselect: 0x52,
        v128_any_true: 0x53,
        i32x4_shl: 0xab,
        i32x4_shr_u: 0xad,
        i32x4_shr_s: 0xac,
        i64x2_shl: 0xcb,
        i64x2_shr_u: 0xcd,
        i64x2_shr_s: 0xcc,
    };

    static SIMD_PREFIX = 0xfd;

    static SECTION = {
        custom: 0,
        type: 1,
        import: 2,
        function: 3,
        table: 4,
        memory: 5,
        global: 6,
        export: 7,
        start: 8,
        element: 9,
        code: 10,
        data: 11,
        data_count: 12,
    };

    static TYPE = {
        i32: 0x7f,
        i64: 0x7e,
        f32: 0x7d,
        f64: 0x7c,
        v128: 0x7b,
        func: 0x60,
        empty: 0x40,
    };

    static EXPORT = {
        func: 0x00,
        table: 0x01,
        mem: 0x02,
        global: 0x03,
    };

    #buffer = [];

    constructor() {
    }

    // Returns the generated binary as a Uint8Array.
    get buffer() {
        return new Uint8Array(this.#buffer);
    }

    // Emit a single byte.
    emit(byte) {
        this.#buffer.push(byte & 0xFF);
    }

    // Emit an array of bytes.
    emitBytes(bytes) {
        for (const byte of bytes) {
            this.emit(byte);
        }
    }

    // Emit a SIMD prefix.
    emitSimdPrefix() {
        this.emit(WasmEmitter.SIMD_PREFIX);
    }

    // Emit a SIMD instruction from its opcode.
    emitSimd(opcode) {
        this.emitSimdPrefix();
        this.emitU32(opcode);
    }

    // Emit an unsigned LEB128 integer.
    emitU32(val) {
        val |= 0;
        do {
            let byte = val & 0x7f;
            val >>>= 7;
            if (val !== 0) {
                byte |= 0x80;
            }
            this.emit(byte);
        } while (val !== 0);
    }

    // Emit a signed LEB128 integer.
    emitS32(val) {
        val |= 0;
        while (true) {
            let byte = val & 0x7f;
            val >>= 7;
            if ((val === 0 && (byte & 0x40) === 0) || (val === -1 && (byte & 0x40) !== 0)) {
                this.emit(byte);
                break;
            }
            this.emit(byte | 0x80);
        }
    }

    // Emit a 128-bit constant (v128.const). Accepts a BigInt or an array of 16 bytes.
    emitV128Const(val) {
        this.emitSimd(WasmEmitter.OP.v128_const);
        if (typeof val === 'bigint') {
            for (let i = 0; i < 16; i++) {
                this.emit(Number(val & 0xffn));
                val >>= 8n;
            }
        } else {
            // assume array-like of bytes
             for (let i = 0; i < 16; i++) {
                this.emit(val[i] ?? 0);
            }
        }
    }

    // Emit a shuffle instruction (i8x16.shuffle). Accepts an array of 16 lane indices.
    emitShuffle(lanes) {
        this.emitSimd(WasmEmitter.OP.i8x16_shuffle);
        for (let i = 0; i < 16; i++) {
            this.emit(lanes[i] ?? 0);
        }
    }

    // --- Section Builders ---

    // Combines sections into a full WASM module.
    static createModule(sections) {
        const emitter = new WasmEmitter();
        // Magic
        emitter.emitBytes([0x00, 0x61, 0x73, 0x6d]);
        // Version
        emitter.emitBytes([0x01, 0x00, 0x00, 0x00]);

        for (const section of sections) {
            emitter.emitBytes(section);
        }
        return emitter.buffer;
    }

    // Wraps content in a section header.
    static createSection(id, content) {
        const emitter = new WasmEmitter();
        emitter.emit(id);
        emitter.emitU32(content.length);
        emitter.emitBytes(content);
        return emitter.buffer;
    }

    // Creates the Type section (function signatures).
    static createTypeSection(types) {
        const emitter = new WasmEmitter();
        emitter.emitU32(types.length);
        for (const type of types) {
            emitter.emit(WasmEmitter.TYPE.func);
            emitter.emitU32(type.params.length);
            for (const param of type.params) emitter.emit(param);
            emitter.emitU32(type.results.length);
            for (const result of type.results) emitter.emit(result);
        }
        return WasmEmitter.createSection(WasmEmitter.SECTION.type, emitter.buffer);
    }

    // Creates the Import section.
    static createImportSection(imports) {
        const emitter = new WasmEmitter();
        emitter.emitU32(imports.length);
        for (const imp of imports) {
            const modBytes = new TextEncoder().encode(imp.module);
            emitter.emitU32(modBytes.length);
            emitter.emitBytes(modBytes);

            const fieldBytes = new TextEncoder().encode(imp.field);
            emitter.emitU32(fieldBytes.length);
            emitter.emitBytes(fieldBytes);

            emitter.emit(imp.kind);

            if (imp.kind === WasmEmitter.EXPORT.mem) {
                const limits = imp.type;
                if (limits.max === undefined || limits.max === null) {
                    emitter.emit(0x00); // limit: min
                    emitter.emitU32(limits.min);
                } else {
                    emitter.emit(0x01); // limit: min max
                    emitter.emitU32(limits.min);
                    emitter.emitU32(limits.max);
                }
            }
        }
        return WasmEmitter.createSection(WasmEmitter.SECTION.import, emitter.buffer);
    }

    // Creates the Function section (maps function indices to types).
    static createFunctionSection(typeIndices) {
        const emitter = new WasmEmitter();
        emitter.emitU32(typeIndices.length);
        for (const idx of typeIndices) {
            emitter.emitU32(idx);
        }
        return WasmEmitter.createSection(WasmEmitter.SECTION.function, emitter.buffer);
    }

    // Creates the Memory section.
    static createMemorySection(minPages, maxPages = null) {
        const emitter = new WasmEmitter();
        emitter.emitU32(1); // num memories
        if (maxPages === null) {
            emitter.emit(0x00); // limit: min
            emitter.emitU32(minPages);
        } else {
            emitter.emit(0x01); // limit: min max
            emitter.emitU32(minPages);
            emitter.emitU32(maxPages);
        }
        return WasmEmitter.createSection(WasmEmitter.SECTION.memory, emitter.buffer);
    }

    // Creates the Export section.
    static createExportSection(exports) {
        const emitter = new WasmEmitter();
        emitter.emitU32(exports.length);
        for (const exp of exports) {
            const nameBytes = new TextEncoder().encode(exp.name);
            emitter.emitU32(nameBytes.length);
            emitter.emitBytes(nameBytes);
            emitter.emit(exp.kind); // 0x00 func, 0x01 table, 0x02 mem, 0x03 global
            emitter.emitU32(exp.index);
        }
        return WasmEmitter.createSection(WasmEmitter.SECTION.export, emitter.buffer);
    }

    // Creates the Code section (function bodies).
    static createCodeSection(bodies) {
        const emitter = new WasmEmitter();
        emitter.emitU32(bodies.length);
        for (const body of bodies) {
            emitter.emitU32(body.length);
            emitter.emitBytes(body);
        }
        return WasmEmitter.createSection(WasmEmitter.SECTION.code, emitter.buffer);
    }

    // Helper to create a single function body.
    static createFunctionBody(locals, code) {
        const emitter = new WasmEmitter();
        // Locals: vector of { count, type }
        emitter.emitU32(locals.length);
        for (const local of locals) {
            emitter.emitU32(local.count);
            emitter.emit(local.type);
        }
        emitter.emitBytes(code);
        emitter.emit(WasmEmitter.OP.end);
        return emitter.buffer;
    }
}
