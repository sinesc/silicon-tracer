"use strict";

// Handles compiling and running the actual simulation.
class Simulation {

    static DEFAULT_DELAY = 1;
    static ARRAY_BITS = 8;
    static MAX_DELAY = Simulation.ARRAY_BITS / 2;

    static GATE_MAP = {
        'buffer': { negIn: false, negOut: false, joinOp: null },
        'not'   : { negIn: false, negOut: true,  joinOp: null },
        'and'   : { negIn: false, negOut: false, joinOp: '&' },
        'nand'  : { negIn: false, negOut: true,  joinOp: '&' },
        'or'    : { negIn: false, negOut: false, joinOp: '|' },
        'nor'   : { negIn: false, negOut: true,  joinOp: '|' },
        'xor'   : { negIn: false, negOut: false, joinOp: '^' },
        'xnor'  : { negIn: false, negOut: true,  joinOp: '^' },
    };

    static BUILTIN_MAP = {
        'latch' : { dataTpl: '(load & data) | (~load & q)', inputs: [ 'load', 'data' ], output: 'q' },
        'flipflop' : { dataTpl: '(+clock & data) | (~+clock & q)', inputs: [ 'clock', 'data' ], output: 'q' },
        'buffer3' : { dataTpl: 'data', signalTpl: 'enable', inputs: [ 'enable', 'data' ], output: 'q' },
        'not3' : { dataTpl: '~data', signalTpl: 'enable', inputs: [ 'enable', 'data' ], output: 'q' },
    }

    #debug = false;
    #ioMap = new Map();
    #nets = [];
    #gates = [];
    #clocks = [];
    #compiled;
    #alloc8Base = 0;
    #alloc32Base = 0;
    #mem8;
    #mem32;

    constructor(debug = false) {
        assert.bool(debug);
        this.#debug = debug;
    }

    // Declares a net (which inputs/outputs are connected) and returns the net-index. Attached IO-names must include their suffixes. Meta can be any custom data.
    declareNet(attachedIONames, meta) {
        assert.array(attachedIONames, false, (i) => assert.string(i));
        this.#nets.push({ offset: this.#alloc8(), io: attachedIONames, meta });
        return this.#nets.length - 1;
    }

    // Declares a basic builtin gate-like function and returns the gate-index. Suffix is appended to the builtin's pre-defined IO-names.
    declareBuiltin(type, suffix, delay = null) {
        assert.string(type);
        assert.string(suffix);
        assert.integer(delay, true);
        const rules = Simulation.BUILTIN_MAP[type];
        const replacer = (_, mode, ident) => {
            let name = ident + suffix;
            if (mode === '+') {
                // shortcuts for rising edge detection: prefix name with +
                // 00 => 0
                // 01 => 0
                // 10 => 1
                // 11 => 0
                return `(((${name} & 0b10) >> 1) & (~${name} & 0b01))`;
            } else if (mode === '-') {
                // shortcuts for falling edge detection: prefix name with -
                // 00 => 0
                // 01 => 1
                // 10 => 0
                // 11 => 0
                return `(((~${name} & 0b10) >> 1) & (${name} & 0b01))`;
            } else {
                return name;
            }
        };
        const dataTpl = rules.dataTpl.replace(/(\+|\-|\b)([a-z]+)\b/g, replacer);
        const signalTpl = (rules.signalTpl ?? '').replace(/(\+|\-|\b)([a-z]+)\b/g, replacer);
        const inputs = rules.inputs.map((i) => i + suffix);
        const output = rules.output + suffix;
        this.#gates.push({ inputs, output, dataTpl, signalTpl });
        for (const input of inputs) {
            this.#declareIO(input, 'i', delay ?? Simulation.DEFAULT_DELAY);
        }
        this.#declareIO(output, 'o', 0);
        return this.#gates.length - 1;
    }

    // Declares a clock with the given frequency at the given tps. Suffix is appended to the builtin's pre-defined IO-names.
    declareClock(frequency, tps, tristate, suffix, delay = null) {
        assert.number(frequency);
        assert.integer(tps);
        assert.bool(tristate);
        assert.string(suffix);
        const input = 'enable' + suffix;
        const output = 'c' + suffix
        this.#clocks.push({ frequency, tps, tristate, input, output, offset: this.#alloc32() });
        this.#declareIO(input, 'i', delay ?? Simulation.DEFAULT_DELAY);
        this.#declareIO(output, 'o', 0);
        return this.#clocks.length - 1;
    }

    // Declares a gate with the given inputs/output and returns the gate-index. For convenience, suffix is appended to all IO-names.
    declareGate(type, inputNames, outputName, suffix, delay = null) {
        assert.string(type);
        assert.string(suffix);
        assert.array(inputNames, false, (i) => assert.string(i));
        assert.string(outputName);
        assert.integer(delay, true);
        const rules = Simulation.GATE_MAP[type];
        const inputs = inputNames.map((i) => i + suffix);
        const output = outputName + suffix;
        const inner = inputs.map((v) => (rules.negIn ? '(~' + v + ')' : v)).join(' ' + rules.joinOp + ' ');
        const dataTpl = rules.negOut ? '(~(' + inner + '))' : inner;
        const signalTpl = '';
        this.#gates.push({ inputs, output, dataTpl, signalTpl });
        for (const input of inputs) {
            this.#declareIO(input, 'i', 0);
        }
        this.#declareIO(output, 'o', delay ?? Simulation.DEFAULT_DELAY);
        return this.#gates.length - 1;
    }

    // Compiles the circuit and initializes memory, making it ready for simulate().
    compile() {
        this.#compileFunction();
        this.#mem8 = new Uint8Array(this.#alloc8Base);
        this.#mem32 = new Int32Array(this.#alloc32Base);
        for (const clock of this.#clocks) {
            const ticks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
            this.#mem32[clock.offset] = ticks + 2; // clean up first clock cycle (clock triggers on 0 but counter resets at -1)
        }
    }

    // Updates all clocks in the circuit for the given TPS and recompiles the simulation without resetting it.
    updateClocks(tps) {
        assert.integer(tps);
        for (let clock of values(this.#clocks)) {
            const previousMaxTicks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
            // set new tps to compute ticks/cycle
            clock.tps = tps;
            // new tps will not change the tick counter for the current cycle, so we have to fix that as well
            const newMaxTicks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
            const remainingTicks = this.#mem32[clock.offset];
            this.#mem32[clock.offset] = 0 | (remainingTicks * newMaxTicks / previousMaxTicks);
        }
        this.#compileFunction();
    }

    // Runs the simulation for the given number of ticks.
    simulate(ticks = 1) {
        this.#compiled(ticks, this.#mem8, this.#mem32);
    }

    // Returns whether the simulation is ready to run (has been compiled).
    get ready() {
        return typeof this.#compiled === 'function';
    }

    // Returns a list of defined gates.
    get gates() {
        return this.#gates;
    }

    // Returns a list of defined nets.
    get nets() {
        return this.#nets;
    }

    // Returns a list of defined clocks.
    get clocks() {
        return this.#clocks;
    }

    // Sets the value of a net in the simulation. null to unset, 1/0 to set value.
    setNetValue(index, value) {
        assert.integer(index);
        assert.integer(value, true);
        const offset = this.#getNet(index).offset;
        this.#mem8[offset] = ((value !== null) << Simulation.MAX_DELAY) | value;
    }

    // Gets the value of a net in the simulation.
    getNetValue(index) {
        assert.integer(index);
        const offset = this.#getNet(index).offset;
        const value = this.#mem8[offset];
        return value & (1 << Simulation.MAX_DELAY) ? value & 1 : null;
    }

    // Returns code of the simulation for debugging purposes.
    code() {
        const compiled = this.#compileTick();
        return "// alloc mem[" + this.#alloc8Base + "]\n" + compiled;
    }

    // Returns current memory contents for debugging purposes.
    mem() {
        const result = { net: {}, io: {}, clock: {} };
        for (const [ name, io ] of this.#ioMap) {
            result.io[name] = this.#mem8[io.offset];
        }
        for (const [ netIndex, net ] of this.#nets.entries()) {
            result.net[netIndex] = this.#mem8[net.offset];
        }
        for (const [ clockIndex, clock ] of this.#clocks.entries()) {
            result.clock[clockIndex] = this.#mem32[clock.offset];
        }
        return result;
    }

    // Allocates memory for a single port or net.
    #alloc8() {
        return this.#alloc8Base++;
    }

    // Allocates memory for a clock.
    #alloc32() {
        return this.#alloc32Base++;
    }

    // Declares a named input or output.
    #declareIO(name, type, delay = null) {
        assert.string(name);
        assert.string(type);
        assert.integer(delay, true);
        if (!/^[a-z_][a-z0-9_@]*$/.test(name)) {
            throw new Error('Invalid io name "' + name + '"');
        }
        this.#ioMap.set(name, { offset: this.#alloc8(), delay: delay ?? Simulation.DEFAULT_DELAY, in: type.indexOf('i') !== -1, out: type.indexOf('o') !== -1 });
    }

    // Compiles a net to input assertion.
    #compileNetToInput(ioName, netIndex) {
        const inputDelay = this.#getIO(ioName).delay;
        const netMem = this.#compileNetAccess(netIndex);
        const inputMem = this.#compileIOAccess(ioName);
        if (inputDelay > 0) {
            // shift net value up to newest io-data/signal bits and apply
            const clearMask = this.#compileDelayMask(inputDelay);
            return `${inputMem} = ((${inputMem} >> 1) & ${clearMask}) | (${netMem} << ${inputDelay})`;
        } else {
            // 0 delay path, not much to do
            // TODO: 0-tick-input: skip this, have gate read straight from net instead
            return `${inputMem} = ${netMem}`;
        }
    }

    // Compiles a gate reading from one or more inputs and writing to an output.
    #compileGate(gateIndex, ioReplacements) {
        const gate = this.#gates[gateIndex];
        const outputDelay = this.#getIO(gate.output).delay;
        const dataOp = gate.dataTpl.replace(/\b[a-z_][a-z0-9_@]*\b/g, (match) => ioReplacements[match] ?? 'error');
        const signalOp = gate.signalTpl.replace(/\b[a-z_][a-z0-9_@]*\b/g, (match) => ioReplacements[match] ?? 'error');
        const outputMem = this.#compileIOAccess(gate.output);
        let computeSignal;
        if (outputDelay > 0) {
            // perform signal computation, if required, otherwise just set the newest signal bit slot
            const signalShift = Simulation.MAX_DELAY + outputDelay;
            const signalBit = this.#compileConst(1 << signalShift);
            if (signalOp !== '') {
                // perform signal computation, then shift result into newest signal bit slot
                computeSignal = `((${signalOp}) << ${signalShift}) & ${signalBit}`;
            } else {
                computeSignal = `${signalBit}`;
            }
            // perform data computation, then shift result into newest data bit slot and join both result parts
            const dataShift = outputDelay;
            const dataBit = this.#compileConst(1 << dataShift);
            const computeData = `((${dataOp}) << ${dataShift}) & ${dataBit}`;
            // unset previously newest signal and data bits and replace with newly computed ones, write back
            const clearMask = this.#compileDelayMask(outputDelay);
            return `${outputMem} = ((${outputMem} >> 1) & ${clearMask}) | ((${computeSignal}) | (${computeData}))`;
        } else {
            // optimized path for 0 delay outputs
            const signalShift = Simulation.MAX_DELAY;
            const signalBit = this.#compileConst(1 << signalShift);
            const dataBit = this.#compileConst(1);
            if (signalOp !== '') {
                computeSignal = `((${signalOp}) << ${signalShift})`; // skipping masking with signalBit here since the shift ensures it can't leak into data
            } else {
                computeSignal = `${signalBit}`;
            }
            return `${outputMem} = ${computeSignal} | ((${dataOp}) & ${dataBit})`; // not skipping masking with dataBit here since some builtins would leak data into signal
        }
    }

    // Compiles a clock reading from one input and writing to an output.
    #compileClock(clockIndex, ioReplacements) { // TODO: tristate
        const clock = this.#clocks[clockIndex];
        const inputMem = ioReplacements[clock.input];
        const outputMem = this.#compileIOAccess(clock.output);
        const clockMem = this.#compileClockAccess(clock.offset);
        const signalBit = this.#compileConst(1 << Simulation.MAX_DELAY);
        const ticks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
        let code = `${clockMem} -= 1; `                                                         // decrement clock
        code += `cmask = ${clockMem} >> 31; `                                                   // copy sign bit into entire mask
        code += `${clockMem} = ((${clockMem} & ~cmask) | (${ticks} & cmask)); `;                // either retain current clock value or reset it to ticks on reaching -1
        code += `${outputMem} = ${signalBit} | (${inputMem} & (${outputMem} ^ !${clockMem}))`;  // flip output mem each time the clock reaches 0
        return code;
    }

    // Compiles an output to net assertion.
    #compileOutputToNet(netIndex, ioName, reset) {
        const netMem = this.#compileNetAccess(netIndex);
        const outputMem = this.#compileIOAccess(ioName);
        const signalMask = this.#compileConst(1 << Simulation.MAX_DELAY);
        let code = `signal = ${outputMem} & ${signalMask}; `;                       // select only the signal bit
        const maskCode = `signal | (signal >> ${Simulation.MAX_DELAY})`;            // duplicate signal bit into data bit to build a mask
        if (reset) {
            code += `${netMem} = (${outputMem} & (${maskCode}))`;                   // reset net to io-data/signal on first assert to net
        } else {
            code += `mask = ${maskCode}; `;
            code += `${netMem} = (${netMem} & ~mask) | (${outputMem} & mask)`;      // apply io-data/signal to net if signal is set
        }
        return code;
    }

    // Compiles and returns code to tick all gates once.
    #compileTick() {
        let result = ''
        // copy net-state to connected ports
        for (const [ netIndex, net ] of this.#nets.entries()) {
            for (const name of net.io) {
                if (this.#getIO(name).in) {
                    // TODO 0-tick-input: skip this
                    result += this.#compileNetToInput(name, netIndex) + this.#endl('tick and set ' + name + ' from net ' + netIndex);
                }
            }
        }
        // process inputs using defined gates
        const ioReplacements = { };
        for (const [ name ] of this.#ioMap) {
            ioReplacements[name] = this.#compileIOAccess(name); // TODO: 0-tick-input: generate net-access instead of io-access
        }
        for (const [ clockIndex, clock ] of this.#clocks.entries()) {
            result += this.#compileClock(clockIndex, ioReplacements) + this.#endl('clock ' + clock.output, true);
        }
        for (const [ gateIndex, gate ] of this.#gates.entries()) {
            result += this.#compileGate(gateIndex, ioReplacements) + this.#endl('compute ' + gate.dataTpl, true);
        }
        // copy port-state to attached net
        for (const [ netIndex, net ] of this.#nets.entries()) {
            // first write to net resets it
            let resetNet = true;
            for (const name of net.io ) {
                if (this.#getIO(name).out) {
                    result += this.#compileOutputToNet(netIndex, name, resetNet) + this.#endl((resetNet ? 're' : '') + 'set net ' + netIndex + ' from ' + name);
                    resetNet = false;
                }
            }
        }
        return result;
    }

    // Compiles and sets the internal simulation tick function.
    #compileFunction() {
        let code = "'use strict';(ticks, mem, mem32) => {\n";
        code += 'let mask, signal, cmask' + this.#endl();
        code += 'ticks |= 0;' + this.#endl();
        code += 'for (let i = 0; i < ticks; ++i) {' + this.#endl();
        code += this.#compileTick();
        code += '}';
        code += '}';
        this.#compiled = eval(code);
    }

    // Retuns code to refer to an IO state.
    #compileIOAccess(name) {
        return 'mem[' + this.#getIO(name).offset + ']';
    }

    // Returns code to refer to the state of a net.
    #compileNetAccess(index) {
        return 'mem[' + this.#getNet(index).offset + ']';
    }

    // Returns code to refer to the state of a clock.
    #compileClockAccess(index) {
        return 'mem32[' + this.#getClock(index).offset + ']';
    }

    // Returns code for a bitmask with the signal and data bits for the given delay being unset.
    #compileDelayMask(delay) {
        const clearDataMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << delay);
        const clearSignalMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << (Simulation.MAX_DELAY + delay));
        return this.#compileConst(clearSignalMask & clearDataMask);
    }

    // Returns code for a constant (written in binary notation for better readability of compiled code).
    #compileConst(value) {
        if (this.#debug) {
            let result = '0b';
            for (let i = Simulation.ARRAY_BITS - 1; i >= 0; --i) {
                result += ((value & (1 << i)) > 0 ? '1' : '0');
            }
            return result;
        } else {
            return '' + value;
        }
    }

    // Returns a semicolon followed by an optional comment if debug is set and a newline.
    #endl(comment, short = false) {
        let lastHash = '';
        let result = '; ' + (this.#debug && comment ? '// ' + comment.replace(/@(g[a-f0-9]+)@([0-9]+)/g, (m, h, i) => { lastHash = h.substr(1, 6) + ':' + i; return (short ? '' : ':' + lastHash); }) : '');
        result += (this.#debug && comment && short ? ` of ${lastHash}\n` : "\n");
        return result;
    }

    // Returns an input/output declaration.
    #getIO(name) {
        let io;
        if ((io = this.#ioMap.get(name)) !== undefined) {
            return io;
        } else {
            throw new Error('Undefined IO ' + name);
        }
    }

    // Returns a net declaration.
    #getNet(index) {
        let net;
        if ((net = this.#nets[index]) !== undefined) {
            return net;
        } else {
            throw new Error('Undefined net ' + index);
        }
    }

    // Returns a clock declaration.
    #getClock(index) {
        let clock;
        if ((clock = this.#clocks[index]) !== undefined) {
            return clock;
        } else {
            throw new Error('Undefined clock ' + index);
        }
    }

    // Computes number of ticks between clock edges.
    static #computeClockTicks(tps, frequency) {
        return 0 | (tps / frequency / 2);
    }
}