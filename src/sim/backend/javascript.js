"use strict";

// Generates JavaScript code for the simulation.
class BackendJavascript {

    static BITS_PER_ELEMENT = 32;

    #tickCode = '';
    #initCode = '';
    #debug;
    #mem;

    constructor(debug = false) {
        this.#debug = debug;
    }

    setMem(mem) {
        this.#mem = mem;
    }

    allocMem(requiredMemory) {
        this.#mem = new Uint32Array(requiredMemory);
    }

    // Returns current simulation memory.
    get mem() {
        return this.#mem;
    }

    // Sets a bit in memory.
    setBit(elementIndex, bitIndex) {
        this.#mem[elementIndex] |= 1 << bitIndex;
    }

    // Clears a bit in memory.
    clearBit(elementIndex, bitIndex) {
        this.#mem[elementIndex] &= ~(1 << bitIndex);
    }

    // Gets value of a bit in memory.
    getBit(elementIndex, bitIndex) {
        return (this.#mem[elementIndex] & (1 << bitIndex)) !== 0 ? 1 : 0;
    }

    // Sets a clock parameter.
    setClockParam(index, value) {
        this.#mem[index] = value;
    }

    // Compiles a logic expression (gate/builtin) into an operation object to be emitted later.
    compileLogic(dest, expression, ports, comment) {
        const portModifierRegex = /(\?|\+|\-|\b)([a-z]+)\b/gi;
        const replacer = (_, mode, name) => {
            const port = ports[name];
            if (mode === '+') {
                // rising edge detection
                return `(~mem[${port.elementIndexP}] & mem[${port.elementIndex2}])`;
            } else if (mode === '-') {
                // falling edge detection
                return `(mem[${port.elementIndexP}] & ~mem[${port.elementIndex2}])`;
            } else if (mode === '?') {
                // read signal bit
                return `mem[${port.elementIndex3}]`;
            } else {
                return `mem[${port.elementIndex2}]`;
            }
        };
        let code;
        if (dest.type === 'assign') {
            // generate logic operation code
            code = `mem[${dest.index}] = ${expression.replace(portModifierRegex, replacer)}`;
        } else if (dest.type === 'backup') {
            // generate backup code (to make previous value available) for logic operations that require it for edge detection
            code = `mem[${dest.index}] = mem[${dest.srcIndex}]`;
        }
        return { code, comment, constant: dest.constant };
    }

    // Emits a compiled logic operation.
    emitLogic(operation) {
        const line = operation.code + this.#comment(operation.comment) + '\n';
        if (operation.constant) {
            this.#initCode += line;
        } else {
            this.#tickCode += line;
        }
    }

    // Emits clock logic.
    emitClock(clock, enablePort, outputPort) {
        const counter = `mem[${clock.counterIndex}]`;
        const limit = `mem[${clock.limitIndex}]`;
        const enableBit = enablePort.bitIndex;
        const outputBit = outputPort.bitIndex;
        const outputElem = `mem[${outputPort.elementIndex2}]`;
        const enableElem = `mem[${enablePort.elementIndex2}]`;

        let code = '';
        code += `${counter} = ${counter} - 1;`;
        code += `if (${counter} > ${limit}) {`; // check for underflow (unsigned wrap-around)
        code += `${counter} = ${limit};`;
        code += `if ((${enableElem} >>> ${enableBit}) & 1) { ${outputElem} ^= (1 << ${outputBit}); }`;
        code += `}` + this.#comment(`clock ${clock.id}`) + '\n';
        this.#tickCode += code;
    }

    // Emits assignment (Net->Input).
    emitNetToInput(destElementIndex, bitmaps, comment) {
        let expr = '';
        for (const bitmap of bitmaps) {
            const srcMem = `mem[${bitmap.srcElementIndex2}]`;
            if (bitmap.mode === 'direct') {
                const bitCount = bitmap.endBit - bitmap.startBit + 1;
                if (bitCount === BackendJavascript.BITS_PER_ELEMENT) {
                    expr += ` | ${srcMem}`;
                } else {
                    const maskRaw = (0xFFFFFFFF >>> (32 - bitCount));
                    const mask = maskRaw << bitmap.startBit;
                    expr += ` | (${srcMem} & 0x${(mask >>> 0).toString(16)})`;
                }
            } else if (bitmap.mode === 'duplicate') {
                let destMask = 0;
                for (const destBit of bitmap.destBit) {
                    destMask |= 1 << destBit;
                }
                expr += ` | (-((${srcMem} >>> ${bitmap.srcBit}) & 1) & 0x${(destMask >>> 0).toString(16)})`;
            } else if (bitmap.mode === 'offset') {
                const offset = bitmap.destBit;
                let srcMask = 0;
                for (const srcBit of bitmap.srcBit) {
                    srcMask |= 1 << srcBit;
                }
                const shift = offset < 0 ? '>>> ' + (-offset) : '<< ' + offset;
                expr += ` | ((${srcMem} & 0x${(srcMask >>> 0).toString(16)}) ${shift})`;
            } else if (bitmap.mode === 'single') {
                const shiftVal = bitmap.destBit - bitmap.srcBit;
                const mask = (1 << bitmap.srcBit) >>> 0;
                if (shiftVal === 0) {
                    expr += ` | (${srcMem} & 0x${mask.toString(16)})`;
                } else {
                    const shift = shiftVal < 0 ? '>>> ' + (-shiftVal) : '<< ' + shiftVal;
                    expr += ` | ((${srcMem} & 0x${mask.toString(16)}) ${shift})`;
                }
            }
        }
        this.#tickCode += `mem[${destElementIndex}] = ${expr.slice(3)}` + this.#comment(comment) + '\n';
    }

    // Emits output to net assignment (Value or Signal).
    emitOutputToNet(destElementIndex, bitmaps, mode, comment) {
        let expr = '';
        let constantValue = 0;
        let isConstant = true;

        for (const bitmap of bitmaps) {
            const isAlwaysDriven = bitmap.srcElementIndex3 == null;

            if (mode === 'signal' && isAlwaysDriven) {
                if (bitmap.mode === 'duplicate') {
                    for (const destBit of bitmap.destBit) {
                        constantValue |= (1 << destBit);
                    }
                } else if (bitmap.mode === 'offset') {
                    const offset = bitmap.destBit;
                    let srcMask = 0;
                    for (const srcBit of bitmap.srcBit) {
                        srcMask |= 1 << srcBit;
                    }
                    if (offset < 0) {
                        constantValue |= (srcMask >>> -offset);
                    } else {
                        constantValue |= (srcMask << offset);
                    }
                } else if (bitmap.mode === 'single') {
                    constantValue |= (1 << bitmap.destBit);
                }
                continue;
            }

            isConstant = false;
            const srcMem2 = `mem[${bitmap.srcElementIndex2}]`;
            const srcMem3 = !isAlwaysDriven ? `mem[${bitmap.srcElementIndex3}]` : null;
            const valueExpr = mode === 'value' ? (srcMem3 ? `(${srcMem2} & ${srcMem3})` : srcMem2) : srcMem3;

            if (bitmap.mode === 'duplicate') {
                let destMask = 0;
                for (const destBit of bitmap.destBit) {
                    destMask |= 1 << destBit;
                }
                expr += ` | (-((${valueExpr} >>> ${bitmap.srcBit}) & 1) & 0x${(destMask >>> 0).toString(16)})`;
            } else if (bitmap.mode === 'offset') {
                const offset = bitmap.destBit;
                let srcMask = 0;
                for (const srcBit of bitmap.srcBit) {
                    srcMask |= 1 << srcBit;
                }
                const shift = offset < 0 ? '>>> ' + (-offset) : '<< ' + offset;
                expr += ` | ((${valueExpr} & 0x${(srcMask >>> 0).toString(16)}) ${shift})`;
            } else if (bitmap.mode === 'single') {
                const shiftVal = bitmap.destBit - bitmap.srcBit;
                const mask = (1 << bitmap.srcBit) >>> 0;
                if (shiftVal === 0) {
                    expr += ` | (${valueExpr} & 0x${mask.toString(16)})`;
                } else {
                    const shift = shiftVal < 0 ? '>>> ' + (-shiftVal) : '<< ' + shiftVal;
                    expr += ` | ((${valueExpr} & 0x${mask.toString(16)}) ${shift})`;
                }
            }
        }

        let result = expr.slice(3);
        if (constantValue !== 0) {
            const constHex = `0x${(constantValue >>> 0).toString(16)}`;
            result = result ? `${result} | ${constHex}` : constHex;
        } else if (!result) {
            result = '0';
        }

        const line = `mem[${destElementIndex}] = ${result}` + this.#comment(comment) + '\n';
        if (isConstant && mode === 'signal') {
            this.#initCode += line;
        } else {
            this.#tickCode += line;
        }
    }

    // Emits conflict detection: sets a bit in the conflict element when more than one active driver targets the same net bit.
    emitConflict(destElementIndex, bitmaps, comment) {
        // First pass: compute static accumulator and conflict mask for always-driven (non-tristate) ports.
        // Uses acc & mask pattern so a single driver produces staticConflict = 0.
        let staticAcc = 0;
        let staticConflict = 0;
        const dynamicExprs = [];

        for (const bitmap of bitmaps) {
            const isAlwaysDriven = bitmap.srcElementIndex3 == null;
            if (isAlwaysDriven) {
                let mask = 0;
                if (bitmap.mode === 'duplicate') {
                    for (const destBit of bitmap.destBit) { mask |= (1 << destBit); }
                } else if (bitmap.mode === 'offset') {
                    const offset = bitmap.destBit;
                    let srcMask = 0;
                    for (const srcBit of bitmap.srcBit) { srcMask |= 1 << srcBit; }
                    mask = offset < 0 ? (srcMask >>> -offset) : (srcMask << offset);
                } else {
                    mask = (1 << bitmap.destBit);
                }
                staticConflict |= (staticAcc & mask);
                staticAcc |= mask;
            } else {
                // Tristate port: build signal expression from srcElementIndex3.
                const srcMem3 = `mem[${bitmap.srcElementIndex3}]`;
                let expr;
                if (bitmap.mode === 'duplicate') {
                    let destMask = 0;
                    for (const destBit of bitmap.destBit) { destMask |= 1 << destBit; }
                    expr = `(-((${srcMem3} >>> ${bitmap.srcBit}) & 1) & 0x${(destMask >>> 0).toString(16)})`;
                } else if (bitmap.mode === 'offset') {
                    const offset = bitmap.destBit;
                    let srcMask = 0;
                    for (const srcBit of bitmap.srcBit) { srcMask |= 1 << srcBit; }
                    const shift = offset < 0 ? '>>> ' + (-offset) : '<< ' + offset;
                    expr = `((${srcMem3} & 0x${(srcMask >>> 0).toString(16)}) ${shift})`;
                } else {
                    const shiftVal = bitmap.destBit - bitmap.srcBit;
                    const mask = (1 << bitmap.srcBit) >>> 0;
                    if (shiftVal === 0) {
                        expr = `(${srcMem3} & 0x${mask.toString(16)})`;
                    } else {
                        const shift = shiftVal < 0 ? '>>> ' + (-shiftVal) : '<< ' + shiftVal;
                        expr = `((${srcMem3} & 0x${mask.toString(16)}) ${shift})`;
                    }
                }
                dynamicExprs.push(expr);
            }
        }

        // Build a single assignment expression using acc & s_i accumulation so the result
        // is computed fresh each tick (no stale bits from previous ticks).
        // acc starts with staticAcc (always-driven bits already seen).
        const conflictTerms = [];
        let accExpr = staticAcc !== 0 ? `0x${(staticAcc >>> 0).toString(16)}` : null;
        for (const s of dynamicExprs) {
            if (accExpr !== null) {
                conflictTerms.push(`(${accExpr} & ${s})`);
            }
            accExpr = accExpr !== null ? `(${accExpr} | ${s})` : s;
        }

        // Combine static and dynamic conflict terms into one expression.
        let fullExpr = staticConflict !== 0 ? `0x${(staticConflict >>> 0).toString(16)}` : '';
        for (const term of conflictTerms) {
            fullExpr = fullExpr ? `${fullExpr} | ${term}` : term;
        }

        if (fullExpr) {
            this.#tickCode += `mem[${destElementIndex}] = ${fullExpr}` + this.#comment(comment) + '\n';
        }
    }

    // Emits pull resistors.
    emitPullResistors(pullMasks) {
        for (const [index2, mask] of pairs(pullMasks)) {
            const signal = `mem[${mask.index3}]`;
            const value = `mem[${index2}]`;
            const pullUp = `0x${(Number(mask.up) >>> 0).toString(16)}`;
            const active = `0x${(Number(mask.up | mask.down) >>> 0).toString(16)}`;

            let code = '';
            code += `${value} = (${value} & ${signal}) | (${pullUp} & ~${signal});`;
            code += `${signal} |= ${active}`;
            code += this.#comment('pull resistors') + '\n';
            this.#tickCode += code;
        }
    }

    // Returns a formatted comment string.
    #comment(text) {
        return this.#debug && text ? ` // ${text}` : '';
    }

    // Finalizes and returns the simulation function.
    compile() {
        let code = "'use strict';(mem) => (ticks) => {\n";
        code += this.#initCode;
        code += "ticks |= 0;\n";
        code += "for (let i = 0; i < ticks; ++i) {\n"
        code += this.#tickCode;
        code += "}\n";
        code += "}\n";
        return eval(code)(this.#mem);
    }

    // Compiles step generator.
    compileStep() {
        // Inject yield for debugger
        const debugTick = this.#tickCode.split('\n').join("\nif (yield) debugger;\n");
        let code = "'use strict';(function*(mem) {\n";
        code += this.#initCode;
        code += debugTick;
        code += '})';
        const generator = eval(code);
        return generator(this.#mem);
    }
}
