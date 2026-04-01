"use strict";

// Generates JavaScript code for the simulation.
class BackendJavascript {

    static BITS_PER_ELEMENT = 32;

    #tickCode = '';
    #initCode = '';
    #debug;
    #mem;
    #conflictIndices = new Set();

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
            } else {
                expr += ` | ${this.#bitmapExpr(bitmap, srcMem)}`;
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
                constantValue |= this.#bitmapMask(bitmap);
                continue;
            }

            isConstant = false;
            const srcMem2 = `mem[${bitmap.srcElementIndex2}]`;
            const srcMem3 = !isAlwaysDriven ? `mem[${bitmap.srcElementIndex3}]` : null;
            const valueExpr = mode === 'value' ? (srcMem3 ? `(${srcMem2} & ${srcMem3})` : srcMem2) : srcMem3;
            expr += ` | ${this.#bitmapExpr(bitmap, valueExpr)}`;
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
        // Compute static accumulator and conflict mask for always-driven (non-tristate) ports.
        // Uses acc & mask pattern so a single driver produces staticConflict = 0.
        let staticAcc = 0;
        let staticConflict = 0;
        const dynamicExprs = [];

        for (const bitmap of bitmaps) {
            if (bitmap.srcElementIndex3 == null) {
                const mask = this.#bitmapMask(bitmap);
                staticConflict |= (staticAcc & mask);
                staticAcc |= mask;
            } else {
                dynamicExprs.push(this.#bitmapExpr(bitmap, `mem[${bitmap.srcElementIndex3}]`));
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
            this.#conflictIndices.add(destElementIndex);
        }
    }

    // Emits a break-on-condition check: evaluates a user-defined probe expression and breaks the tick loop early if truthy.
    // probeMap is { [probeName]: { elementIndex2, bitIndex } | null } — null probes are substituted with 0.
    emitBreakOnCondition(expr, probeMap) {
        const names = Object.keys(probeMap).sort((a, b) => b.length - a.length);
        // Replace unknown identifiers with null before probe substitution.
        let translated = expr.replace(/\b[a-zA-Z_$][\w$]*\b/g, (m) => Object.hasOwn(probeMap, m) ? m : 'null');
        for (const name of names) {
            const p = probeMap[name];
            let replacement;
            if (!p) {
                replacement = 'null';
            } else {
                // Mirror getNetValue(): undriven → null, conflict → -1, otherwise 0/1.
                const driven  = `((mem[${p.elementIndex3}] >>> ${p.bitIndex}) & 1)`;
                const value   = `((mem[${p.elementIndex2}] >>> ${p.bitIndex}) & 1)`;
                const withConflict = p.elementIndexC !== null
                    ? `((mem[${p.elementIndexC}] >>> ${p.bitIndex}) & 1) ? -1 : ${value}`
                    : value;
                replacement = `(${driven} ? (${withConflict}) : null)`;
            }
            translated = translated.replace(new RegExp('\\b' + name + '\\b', 'g'), replacement);
        }
        try { new Function('mem', `return (${translated})`); }
        catch { return; }
        this.#tickCode += `if (${translated}) { return 2; }` + this.#comment('break on condition') + '\n';
    }

    // Emits a break-on-conflict check: ORs all conflict elements and breaks the tick loop early if any bit is set.
    emitBreakOnConflict() {
        if (this.#conflictIndices.size === 0) return;
        const orExpr = [...this.#conflictIndices].map(i => `mem[${i}]`).join(' | ');
        this.#tickCode += `if (${orExpr}) { return 1; }` + this.#comment('break on conflict') + '\n';
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

    // Emits memory read: consolidates address bits from individual port elements, performs a bounded lookup,
    // and scatters the result to individual data output port elements.
    emitMemoryRead(memory, addrPorts, dataOutPorts) {
        const id = memory.id;
        const addrMask = ((1 << memory.addressWidth) - 1) >>> 0;
        const dataWidth = memory.dataWidth;
        const dataMask = ((1 << dataWidth) - 1) >>> 0;
        const packShift = Math.log2(BackendJavascript.BITS_PER_ELEMENT / dataWidth);
        const subMask = (BackendJavascript.BITS_PER_ELEMENT / dataWidth) - 1;
        const shiftScale = Math.log2(dataWidth);

        let code = '';

        // Consolidate address from individual port elements into a local variable
        let addrExpr = '';
        for (let i = 0; i < addrPorts.length; i++) {
            const port = addrPorts[i];
            const bit = `((mem[${port.elementIndex2}] >>> ${port.bitIndex}) & 1)`;
            addrExpr += i === 0 ? bit : ` | (${bit} << ${i})`;
        }
        code += `var _ma${id} = ${addrExpr};` + this.#comment(`memory ${id} address`) + '\n';

        // Bounded lookup with packing
        if (packShift === 0) {
            // One value per element, no sub-element math needed
            code += `var _md${id} = mem[${memory.baseOffset} + (_ma${id} & 0x${addrMask.toString(16)})]`;
        } else {
            code += `var _md${id} = (mem[${memory.baseOffset} + ((_ma${id} & 0x${addrMask.toString(16)}) >>> ${packShift})] >>> (((_ma${id} & ${subMask}) << ${shiftScale}))) & 0x${dataMask.toString(16)}`;
        }
        code += this.#comment(`memory ${id} read`) + ';\n';

        // Scatter result to individual data output port elements
        for (let i = 0; i < dataOutPorts.length; i++) {
            const port = dataOutPorts[i];
            code += `mem[${port.elementIndex2}] = (_md${id} >>> ${i}) & 1` + this.#comment(`memory ${id} do${i}`) + ';\n';
        }

        this.#tickCode += code;
    }

    // Emits memory write (RAM only): consolidates address and data-in bits, conditionally writes under write-enable.
    emitMemoryWrite(memory, addrPorts, dataInPorts, wePort) {
        const id = memory.id;
        const addrMask = ((1 << memory.addressWidth) - 1) >>> 0;
        const dataWidth = memory.dataWidth;
        const dataMask = ((1 << dataWidth) - 1) >>> 0;
        const packShift = Math.log2(BackendJavascript.BITS_PER_ELEMENT / dataWidth);
        const subMask = (BackendJavascript.BITS_PER_ELEMENT / dataWidth) - 1;
        const shiftScale = Math.log2(dataWidth);

        let code = '';

        // Write-enable check
        code += `if ((mem[${wePort.elementIndex2}] >>> ${wePort.bitIndex}) & 1) {` + this.#comment(`memory ${id} write-enable`) + '\n';

        // Reuse address variable if already emitted by emitMemoryRead (writeBeforeRead=false),
        // otherwise consolidate address independently
        const addrVar = `_ma${id}`;
        if (!memory.writeBeforeRead) {
            // Address was already computed by emitMemoryRead
        } else {
            let addrExpr = '';
            for (let i = 0; i < addrPorts.length; i++) {
                const port = addrPorts[i];
                const bit = `((mem[${port.elementIndex2}] >>> ${port.bitIndex}) & 1)`;
                addrExpr += i === 0 ? bit : ` | (${bit} << ${i})`;
            }
            code += `var ${addrVar} = ${addrExpr};\n`;
        }

        // Consolidate data-in from individual port elements
        let dataExpr = '';
        for (let i = 0; i < dataInPorts.length; i++) {
            const port = dataInPorts[i];
            const bit = `((mem[${port.elementIndex2}] >>> ${port.bitIndex}) & 1)`;
            dataExpr += i === 0 ? bit : ` | (${bit} << ${i})`;
        }

        // Write with packing
        if (packShift === 0) {
            code += `mem[${memory.baseOffset} + (${addrVar} & 0x${addrMask.toString(16)})] = ${dataExpr}`;
        } else {
            const idx = `${memory.baseOffset} + ((${addrVar} & 0x${addrMask.toString(16)}) >>> ${packShift})`;
            const sh = `((${addrVar} & ${subMask}) << ${shiftScale})`;
            code += `var _mi${id} = ${idx};\n`;
            code += `var _ms${id} = ${sh};\n`;
            code += `mem[_mi${id}] = (mem[_mi${id}] & ~(0x${dataMask.toString(16)} << _ms${id})) | ((${dataExpr}) << _ms${id})`;
        }
        code += this.#comment(`memory ${id} write`) + ';\n';
        code += '}\n';

        this.#tickCode += code;
    }

    // Emits output enable control: sets or clears the driven (elementIndex3) bits for each data output port based on OE.
    emitMemoryOutputEnable(memory, dataOutPorts, oePort) {
        const id = memory.id;
        let code = '';
        const oeExpr = `((mem[${oePort.elementIndex2}] >>> ${oePort.bitIndex}) & 1)`;
        code += `var _moe${id} = ${oeExpr};` + this.#comment(`memory ${id} output enable`) + '\n';
        for (let i = 0; i < dataOutPorts.length; i++) {
            const port = dataOutPorts[i];
            code += `mem[${port.elementIndex3}] = _moe${id}` + this.#comment(`memory ${id} do${i} driven`) + ';\n';
        }
        this.#tickCode += code;
    }

    // Returns the integer destination bit mask for a bitmap (duplicate/offset/single modes).
    #bitmapMask(bitmap) {
        if (bitmap.mode === 'duplicate') {
            let mask = 0;
            for (const destBit of bitmap.destBit) { mask |= (1 << destBit); }
            return mask;
        } else if (bitmap.mode === 'offset') {
            const offset = bitmap.destBit;
            let srcMask = 0;
            for (const srcBit of bitmap.srcBit) { srcMask |= 1 << srcBit; }
            return offset < 0 ? (srcMask >>> -offset) : (srcMask << offset);
        } else {
            return (1 << bitmap.destBit);
        }
    }

    // Returns a shifted/masked expression string that maps srcExpr bits to their destination positions.
    #bitmapExpr(bitmap, srcExpr) {
        if (bitmap.mode === 'duplicate') {
            let destMask = 0;
            for (const destBit of bitmap.destBit) { destMask |= 1 << destBit; }
            return `(-((${srcExpr} >>> ${bitmap.srcBit}) & 1) & 0x${(destMask >>> 0).toString(16)})`;
        } else if (bitmap.mode === 'offset') {
            const offset = bitmap.destBit;
            let srcMask = 0;
            for (const srcBit of bitmap.srcBit) { srcMask |= 1 << srcBit; }
            const shift = offset < 0 ? '>>> ' + (-offset) : '<< ' + offset;
            return `((${srcExpr} & 0x${(srcMask >>> 0).toString(16)}) ${shift})`;
        } else {
            const shiftVal = bitmap.destBit - bitmap.srcBit;
            const mask = (1 << bitmap.srcBit) >>> 0;
            if (shiftVal === 0) {
                return `(${srcExpr} & 0x${mask.toString(16)})`;
            } else {
                const shift = shiftVal < 0 ? '>>> ' + (-shiftVal) : '<< ' + shiftVal;
                return `((${srcExpr} & 0x${mask.toString(16)}) ${shift})`;
            }
        }
    }

    // Returns a formatted comment string.
    #comment(text) {
        return this.#debug && text ? ` // ${text}` : '';
    }

    // Finalizes and returns the simulation function.
    // The returned function returns 1 if a break-on-conflict fired, 2 if a break-on-condition fired, 0 otherwise.
    compile() {
        let code = "'use strict';(mem) => (ticks) => {\n";
        code += this.#initCode;
        code += "ticks |= 0;\n";
        code += "for (let i = 0; i < ticks; ++i) {\n"
        code += this.#tickCode;
        code += "}\n";
        code += "return 0;\n";
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
