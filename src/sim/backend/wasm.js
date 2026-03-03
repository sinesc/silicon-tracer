"use strict";

// Generates WebAssembly code for the simulation.
class BackendWasm {

    static BITS_PER_ELEMENT = 128;

    #debug;
    #wasmMemory;
    #initCode = [];
    #tickCode = [];
    #locals = [];

    constructor(debug = false) {
        this.#debug = debug;
        this.#locals = [
            { count: 1, type: WasmEmitter.TYPE.i32 }, // tick counter
            { count: 2, type: WasmEmitter.TYPE.i32 }, // scratch locals for clock (i32)
            { count: 3, type: WasmEmitter.TYPE.v128 }, // scratch locals for v128 ops
        ];
    }

    // Allocates memory for the simulation.
    allocateMemory(size) {
        const bytes = size * 16;
        const pages = Math.ceil(bytes / 65536);
        this.#wasmMemory = new WebAssembly.Memory({ initial: pages });
        return new Uint32Array(this.#wasmMemory.buffer);
    }

    // Helper to emit a v128 shift. shift > 0 is left, shift < 0 is right.
    #emitV128Shift(emitter, shift, signed) {
        if (shift === 0) return;

        const isLeft = shift > 0;
        const n = isLeft ? shift : -shift;
        const shrOp = signed ? WasmEmitter.OP.i64x2_shr_s : WasmEmitter.OP.i64x2_shr_u;

        const byteShift = Math.floor(n / 8);
        const bitShift = n % 8;
        console.log((isLeft ? 'left' : 'right') + ' shifting ' + byteShift + ' bytes ' + bitShift + ' bits');

        if (byteShift >= 16) {
            throw new Error('Shift >= 16 byte not supported');
        }

        // Store original value in a local to use it twice for shuffle
        emitter.emit(WasmEmitter.OP.local_set); emitter.emitU32(3);

        // Main part
        const mainLanes = Array(16).fill(16); // 16 is second operand -> zero
        for (let i = 0; i < 16; i++) {
            const from = isLeft ? i - byteShift : i + byteShift;
            if (from >= 0 && from < 16) mainLanes[i] = from;
        }
        emitter.emit(WasmEmitter.OP.local_get); emitter.emitU32(3);
        emitter.emitV128Const(0n);
        emitter.emitShuffle(mainLanes);

        if (bitShift > 0) {
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(bitShift);
            emitter.emitSimd(isLeft ? WasmEmitter.OP.i64x2_shl : shrOp);
            // Carry part
            const carryLanes = Array(16).fill(16);
            for (let i = 0; i < 16; i++) {
                const from = isLeft ? i - (byteShift + 1) : i + (byteShift + 1);
                if (from >= 0 && from < 16) carryLanes[i] = from;
            }
            emitter.emit(WasmEmitter.OP.local_get); emitter.emitU32(3);
            emitter.emitV128Const(0n);
            emitter.emitShuffle(carryLanes);
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(8 - bitShift);
            emitter.emitSimd(isLeft ? WasmEmitter.OP.i64x2_shr_u : WasmEmitter.OP.i64x2_shl);
            emitter.emitSimd(WasmEmitter.OP.v128_or);
        }
    }


    // Compiles a logic expression (gate/builtin) into an operation object.
    compileLogic(dest, expression, ports, comment) {
        const code = [];

        // Simple shunting-yard parser for expressions like "(a & b) | ~c"
        // Supported operators: ~, &, |, ^. Identifiers: port names.
        // Modifiers: +name (rising), -name (falling), ?name (signal)

        const precedence = { '~': 3, '&': 2, '^': 1, '|': 0, '(': -1 };
        const outputQueue = [];
        const operatorStack = [];

        // Tokenizer regex
        const regex = /([&|^~()])|(\?|\+|\-|\b)([a-z0-9_]+)\b/gi;
        let match;

        while ((match = regex.exec(expression)) !== null) {
            if (match[1]) { // Operator or parenthesis
                const op = match[1];
                if (op === '(') {
                    operatorStack.push(op);
                } else if (op === ')') {
                    while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                        outputQueue.push(operatorStack.pop());
                    }
                    operatorStack.pop(); // Pop '('
                } else { // Operator
                    while (operatorStack.length > 0 && precedence[operatorStack[operatorStack.length - 1]] >= precedence[op]) {
                        outputQueue.push(operatorStack.pop());
                    }
                    operatorStack.push(op);
                }
            } else { // Operand (identifier with optional modifier)
                const mode = match[2] || '';
                const name = match[3];
                const port = ports[name];
                outputQueue.push({ type: 'operand', mode, port });
            }
        }
        while (operatorStack.length > 0) {
            outputQueue.push(operatorStack.pop());
        }

        // Generate code from RPN queue
        const emitter = new WasmEmitter();
        for (const token of outputQueue) {
            if (typeof token === 'string') {
                // Operator
                switch (token) {
                    case '&': emitter.emitSimd(WasmEmitter.OP.v128_and); break;
                    case '|': emitter.emitSimd(WasmEmitter.OP.v128_or); break;
                    case '^': emitter.emitSimd(WasmEmitter.OP.v128_xor); break;
                    case '~': emitter.emitSimd(WasmEmitter.OP.v128_not); break;
                }
            } else {
                // Operand
                const { mode, port } = token;
                if (mode === '+') {
                    // rising edge: (~prev & curr)
                    emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(port.elementIndexP * 16);
                    emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
                    emitter.emitSimd(WasmEmitter.OP.v128_not);

                    emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(port.elementIndex2 * 16);
                    emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

                    emitter.emitSimd(WasmEmitter.OP.v128_and);
                } else if (mode === '-') {
                    emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(port.elementIndexP * 16);
                    emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

                    emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(port.elementIndex2 * 16);
                    emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
                    emitter.emitSimd(WasmEmitter.OP.v128_not);

                    emitter.emitSimd(WasmEmitter.OP.v128_and);
                } else if (mode === '?') {
                    // signal
                    emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(port.elementIndex3 * 16);
                    emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
                } else {
                    // value
                    emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(port.elementIndex2 * 16);
                    emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
                }
            }
        }

        // Store result
        const resultBytes = Array.from(emitter.buffer);
        const storeEmitter = new WasmEmitter();

        if (dest.type === 'signal') {
            storeEmitter.emit(WasmEmitter.OP.i32_const); storeEmitter.emitS32(dest.index * 16);
            storeEmitter.emitBytes(resultBytes);
            storeEmitter.emitSimd(WasmEmitter.OP.v128_store); storeEmitter.emitU32(2); storeEmitter.emitU32(0);
        } else if (dest.type === 'backup') {
            storeEmitter.emit(WasmEmitter.OP.i32_const); storeEmitter.emitS32(dest.index * 16);
            storeEmitter.emit(WasmEmitter.OP.i32_const); storeEmitter.emitS32(dest.srcIndex * 16);
            storeEmitter.emitSimd(WasmEmitter.OP.v128_load); storeEmitter.emitU32(2); storeEmitter.emitU32(0);
            storeEmitter.emitSimd(WasmEmitter.OP.v128_store); storeEmitter.emitU32(2); storeEmitter.emitU32(0);
        }

        return { code: Array.from(storeEmitter.buffer), comment, constant: dest.constant };
    }

    // Emits a compiled logic operation.
    emitLogic(operation) {
        if (operation.constant) {
            this.#initCode.push(...operation.code);
        } else {
            this.#tickCode.push(...operation.code);
        }
    }

    // Emits clock logic.
    emitClock(clock, enablePort, outputPort) {
        const emitter = new WasmEmitter();
        const counterOffset = clock.counterIndex * 16;
        const limitOffset = clock.limitIndex * 16;
        const enableOffset = enablePort.elementIndex2 * 16;
        const outputOffset = outputPort.elementIndex2 * 16;

        // Branchless clock logic (scalar i32 for counter)
        // 1. Decrement counter
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(counterOffset); // address for store
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(counterOffset); // address for load
        emitter.emit(WasmEmitter.OP.i32_load); emitter.emitU32(2); emitter.emitU32(0);
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(1);
        emitter.emit(WasmEmitter.OP.i32_sub);
        emitter.emit(WasmEmitter.OP.local_tee); emitter.emitU32(1); // store new counter in local 1, keep on stack

        // 2. Create underflow mask
        // mask = counter >> 31;
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(31);
        emitter.emit(WasmEmitter.OP.i32_shr_s);
        emitter.emit(WasmEmitter.OP.local_tee); emitter.emitU32(2); // store mask in local 2, keep on stack

        // 3. Reset counter on underflow
        // counter = (counter & ~mask) | (limit & mask);
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(-1);
        emitter.emit(WasmEmitter.OP.i32_xor); // ~mask
        emitter.emit(WasmEmitter.OP.local_get); emitter.emitU32(1); // get new counter
        emitter.emit(WasmEmitter.OP.i32_and); // counter & ~mask
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(limitOffset); // load limit
        emitter.emit(WasmEmitter.OP.i32_load); emitter.emitU32(2); emitter.emitU32(0);
        emitter.emit(WasmEmitter.OP.local_get); emitter.emitU32(2); // get mask
        emitter.emit(WasmEmitter.OP.i32_and); // limit & mask
        emitter.emit(WasmEmitter.OP.i32_or);
        emitter.emit(WasmEmitter.OP.i32_store); emitter.emitU32(2); emitter.emitU32(0);

        // 4. Toggle output if enabled and clock underflowed
        // if (mask & is_enabled)

        // Check enable bit
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(enableOffset);
        emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
        emitter.emitV128Const(1n << BigInt(enablePort.bitIndex));
        emitter.emitSimd(WasmEmitter.OP.v128_and);
        emitter.emitSimd(WasmEmitter.OP.v128_any_true); // 1 if enabled, 0 if not

        // Combine with underflow mask
        emitter.emit(WasmEmitter.OP.local_get); emitter.emitU32(2); // mask (-1 or 0)
        emitter.emit(WasmEmitter.OP.i32_and);

        // If result is non-zero (meaning mask is -1 AND enabled is 1)
        emitter.emit(WasmEmitter.OP.if);
        emitter.emit(WasmEmitter.TYPE.empty);
            // Toggle output
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(outputOffset); // address for store
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(outputOffset); // address for load
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
            emitter.emitV128Const(1n << BigInt(outputPort.bitIndex));
            emitter.emitSimd(WasmEmitter.OP.v128_xor);
            emitter.emitSimd(WasmEmitter.OP.v128_store); emitter.emitU32(4); emitter.emitU32(0);
        emitter.emit(WasmEmitter.OP.end);

        this.#tickCode.push(...emitter.buffer);
    }

    // Emits assignment (Net->Input).
    emitAssignment(destElementIndex, bitmaps, comment) {
        const emitter = new WasmEmitter();

        // dest = ...
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(destElementIndex * 16);

        // Generate expression for value
        let first = true;
        for (const bitmap of bitmaps) {
            // Load src
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(bitmap.srcElementIndex2 * 16);
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

            if (bitmap.mode === 'direct') {
                const bitCount = bitmap.endBit - bitmap.startBit + 1;
                if (bitCount !== 128) {
                    const mask = ((1n << BigInt(bitCount)) - 1n) << BigInt(bitmap.startBit);
                    emitter.emitV128Const(mask);
                    emitter.emitSimd(WasmEmitter.OP.v128_and);
                }
            } else if (bitmap.mode === 'duplicate') {
                // Create mask from single bit: (val << (127-bit)) >>s 127
                this.#emitV128Shift(emitter, 127 - bitmap.srcBit, false);
                this.#emitV128Shift(emitter, -127, true);

                // & destMask
                let destMask = 0n;
                for (const destBit of bitmap.destBit) destMask |= (1n << BigInt(destBit));
                emitter.emitV128Const(destMask);
                emitter.emitSimd(WasmEmitter.OP.v128_and);

            } else if (bitmap.mode === 'offset') {
                const offset = bitmap.destBit;
                let srcMask = 0n;
                for (const srcBit of bitmap.srcBit) srcMask |= (1n << BigInt(srcBit));
                emitter.emitV128Const(srcMask);
                emitter.emitSimd(WasmEmitter.OP.v128_and);
                this.#emitV128Shift(emitter, offset, false);

            } else if (bitmap.mode === 'single') {
                const mask = 1n << BigInt(bitmap.srcBit);
                emitter.emitV128Const(mask);
                emitter.emitSimd(WasmEmitter.OP.v128_and);
                const shiftVal = bitmap.destBit - bitmap.srcBit;
                this.#emitV128Shift(emitter, shiftVal, false);
            }

            if (!first) {
                emitter.emitSimd(WasmEmitter.OP.v128_or);
            }
            first = false;
        }

        if (bitmaps.length === 0) {
            emitter.emitV128Const(0n);
        }

        emitter.emitSimd(WasmEmitter.OP.v128_store); emitter.emitU32(2); emitter.emitU32(0);
        this.#tickCode.push(...emitter.buffer);
    }

    // Emits output to net assignment (Value or Signal).
    emitOutputToNet(destElementIndex, bitmaps, mode, comment) {
        const emitter = new WasmEmitter();
        let constantValue = 0n;
        let isConstant = true;
        let hasDynamic = false;

        // dest = ...
        emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(destElementIndex * 16);

        for (const bitmap of bitmaps) {
            const isAlwaysDriven = bitmap.srcElementIndex3 == null;

            if (mode === 'signal' && isAlwaysDriven) {
                // Calculate constant part
                if (bitmap.mode === 'duplicate') {
                    for (const destBit of bitmap.destBit) constantValue |= (1n << BigInt(destBit));
                } else if (bitmap.mode === 'offset') {
                    let srcMask = 0n;
                    for (const srcBit of bitmap.srcBit) srcMask |= (1n << BigInt(srcBit));
                    if (bitmap.destBit < 0) constantValue |= (srcMask >> BigInt(-bitmap.destBit));
                    else constantValue |= (srcMask << BigInt(bitmap.destBit));
                } else if (bitmap.mode === 'single') {
                    constantValue |= (1n << BigInt(bitmap.destBit));
                }
                continue;
            }

            isConstant = false;

            // Load value (src2)
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(bitmap.srcElementIndex2 * 16);
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

            // If value mode and not always driven, mask with signal (src3)
            if (mode === 'value' && !isAlwaysDriven) {
                emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(bitmap.srcElementIndex3 * 16);
                emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
                emitter.emitSimd(WasmEmitter.OP.v128_and);
            } else if (mode === 'signal' && !isAlwaysDriven) {
                // If signal mode, we need src3 instead of src2
                // Pop src2
                emitter.emit(WasmEmitter.OP.drop);
                // Load src3
                emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(bitmap.srcElementIndex3 * 16);
                emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
            }

            // Apply shifts/masks (same logic as emitAssignment)
            if (bitmap.mode === 'duplicate') {
                this.#emitV128Shift(emitter, 127 - bitmap.srcBit, false);
                this.#emitV128Shift(emitter, -127, true);
                let destMask = 0n;
                for (const destBit of bitmap.destBit) destMask |= (1n << BigInt(destBit));
                emitter.emitV128Const(destMask);
                emitter.emitSimd(WasmEmitter.OP.v128_and);
            } else if (bitmap.mode === 'offset') {
                const offset = bitmap.destBit;
                let srcMask = 0n;
                for (const srcBit of bitmap.srcBit) srcMask |= (1n << BigInt(srcBit));
                emitter.emitV128Const(srcMask);
                emitter.emitSimd(WasmEmitter.OP.v128_and);
                this.#emitV128Shift(emitter, offset, false);
            } else if (bitmap.mode === 'single') {
                const mask = 1n << BigInt(bitmap.srcBit);
                emitter.emitV128Const(mask);
                emitter.emitSimd(WasmEmitter.OP.v128_and);
                const shiftVal = bitmap.destBit - bitmap.srcBit;
                this.#emitV128Shift(emitter, shiftVal, false);
            }

            if (hasDynamic) {
                emitter.emitSimd(WasmEmitter.OP.v128_or);
            }
            hasDynamic = true;
        }

        if (constantValue !== 0n) {
            emitter.emitV128Const(constantValue);
            if (hasDynamic) {
                emitter.emitSimd(WasmEmitter.OP.v128_or);
            }
            hasDynamic = true;
        }

        if (!hasDynamic) {
            emitter.emitV128Const(0n);
        }

        emitter.emitSimd(WasmEmitter.OP.v128_store); emitter.emitU32(2); emitter.emitU32(0);

        if (isConstant && mode === 'signal') {
            this.#initCode.push(...emitter.buffer);
        } else {
            this.#tickCode.push(...emitter.buffer);
        }
    }

    // Emits pull resistors.
    emitPullResistors(pullMasks) {
        const emitter = new WasmEmitter();
        for (const [index2, mask] of pairs(pullMasks)) {
            const signalOffset = mask.index3 * 16;
            const valueOffset = index2 * 16;
            const pullUp = mask.up;
            const active = mask.up | mask.down;

            // value = (value & signal) | (pullUp & ~signal)
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(valueOffset); // store addr

            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(valueOffset); // load addr
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(signalOffset); // load addr
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

            emitter.emitSimd(WasmEmitter.OP.v128_and); // value & signal

            emitter.emitV128Const(pullUp);
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(signalOffset); // load addr
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);
            emitter.emitSimd(WasmEmitter.OP.v128_not); // ~signal
            emitter.emitSimd(WasmEmitter.OP.v128_and); // pullUp & ~signal

            emitter.emitSimd(WasmEmitter.OP.v128_or);
            emitter.emitSimd(WasmEmitter.OP.v128_store); emitter.emitU32(2); emitter.emitU32(0);

            // signal |= active
            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(signalOffset); // store addr

            emitter.emit(WasmEmitter.OP.i32_const); emitter.emitS32(signalOffset); // load addr
            emitter.emitSimd(WasmEmitter.OP.v128_load); emitter.emitU32(2); emitter.emitU32(0);

            emitter.emitV128Const(active);
            emitter.emitSimd(WasmEmitter.OP.v128_or);
            emitter.emitSimd(WasmEmitter.OP.v128_store); emitter.emitU32(2); emitter.emitU32(0);
        }
        this.#tickCode.push(...emitter.buffer);
    }

    // Finalizes and returns the simulation function.
    compile(mem) {
        // Create WASM module
        const typeSection = WasmEmitter.createTypeSection([
            { params: [], results: [] }, // 0: void -> void
            { params: [WasmEmitter.TYPE.i32], results: [] } // 1: i32 -> void
        ]);
        const funcSection = WasmEmitter.createFunctionSection([0, 1]); // init: type 0, tick: type 1
        const importSection = WasmEmitter.createImportSection([
            { module: 'env', field: 'mem', kind: WasmEmitter.EXPORT.mem, type: { min: this.#wasmMemory.buffer.byteLength / 65536 } }
        ]);
        const exportSection = WasmEmitter.createExportSection([
            { name: 'mem', kind: WasmEmitter.EXPORT.mem, index: 0 },
            { name: 'init', kind: WasmEmitter.EXPORT.func, index: 0 },
            { name: 'tick', kind: WasmEmitter.EXPORT.func, index: 1 }
        ]);

        // Init body
        const initBody = WasmEmitter.createFunctionBody(this.#locals.slice(1), this.#initCode);

        // Tick body
        // Loop structure:
        // loop $label
        //   local.get $ticks
        //   i32.eqz
        //   br_if $end
        //   ... tick code ...
        //   local.get $ticks
        //   i32.const 1
        //   i32.sub
        //   local.set $ticks
        //   br $label
        // end $end

        const tickEmitter = new WasmEmitter();
        tickEmitter.emit(WasmEmitter.OP.loop);
        tickEmitter.emit(WasmEmitter.TYPE.empty);

        tickEmitter.emit(WasmEmitter.OP.local_get); tickEmitter.emitU32(0);
        tickEmitter.emit(WasmEmitter.OP.i32_eqz);
        tickEmitter.emit(WasmEmitter.OP.br_if); tickEmitter.emitU32(1); // break to end of function (depth 1 out of loop?) No, br_if breaks out of block/loop.
        // Actually, to break loop we need a block around it or use br_if to branch OUT.
        // Standard pattern:
        // block
        //   loop
        //     br_if 1 (break block)
        //     ...
        //     br 0 (continue loop)
        //   end
        // end

        // Let's redo loop structure properly
        // block $break
        //   loop $continue
        //     local.get $ticks
        //     i32.eqz
        //     br_if $break (1)

        //     ... tick code ...

        //     local.get $ticks
        //     i32.const 1
        //     i32.sub
        //     local.set $ticks
        //     br $continue (0)
        //   end
        // end

        const loopBody = new WasmEmitter();
        loopBody.emit(WasmEmitter.OP.block);
        loopBody.emit(WasmEmitter.TYPE.empty);
        loopBody.emit(WasmEmitter.OP.loop);
        loopBody.emit(WasmEmitter.TYPE.empty);

        loopBody.emit(WasmEmitter.OP.local_get); loopBody.emitU32(0);
        loopBody.emit(WasmEmitter.OP.i32_eqz);
        loopBody.emit(WasmEmitter.OP.br_if); loopBody.emitU32(1);

        loopBody.emitBytes(this.#tickCode);

        loopBody.emit(WasmEmitter.OP.local_get); loopBody.emitU32(0);
        loopBody.emit(WasmEmitter.OP.i32_const); loopBody.emitS32(1);
        loopBody.emit(WasmEmitter.OP.i32_sub);
        loopBody.emit(WasmEmitter.OP.local_set); loopBody.emitU32(0);

        loopBody.emit(WasmEmitter.OP.br); loopBody.emitU32(0);

        loopBody.emit(WasmEmitter.OP.end); // loop
        loopBody.emit(WasmEmitter.OP.end); // block

        const tickBody = WasmEmitter.createFunctionBody(this.#locals.slice(1), loopBody.buffer);

        const codeSection = WasmEmitter.createCodeSection([initBody, tickBody]);

        const moduleBytes = WasmEmitter.createModule([typeSection, importSection, funcSection, exportSection, codeSection]);

        // Instantiate
        const module = new WebAssembly.Module(moduleBytes);
        const instance = new WebAssembly.Instance(module, { env: { mem: this.#wasmMemory } });

        // Run init
        instance.exports.init();

        return instance.exports.tick;
    }

    // Compiles step generator.
    compileStep(mem) {
        // WASM doesn't support yield/generators easily.
        // We return a JS wrapper that calls the WASM tick function with 1 tick.
        const tickFunc = this.compile(mem);
        return (function*() {
            while (true) {
                if (yield) debugger;
                tickFunc(1);
            }
        })();
    }
}
