"use strict";

// Handles compiling and running the actual simulation.
class Simulation {

    static ARRAY_BITS = 8;
    static SIGNAL_SHIFT = Simulation.ARRAY_BITS / 2;
    static OPTIMIZE_0TICK_INPUTS = true;

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
        'latch'     : { outputs: { q: '(load & data) | (~load & q)' }, inputs: [ 'load', 'data' ], statsGates: 4  },
        'flipflop'  : { outputs: { q: '(+clock & data) | (~+clock & q)' }, inputs: [ 'clock', 'data' ], statsGates: 6 },
        'buffer3'   : { outputs: { q: 'data' }, signals: { q: 'enable' }, inputs: [ 'enable', 'data' ], statsGates: 1 },
        'not3'      : { outputs: { q: '~data' }, signals: { q: 'enable' }, inputs: [ 'enable', 'data' ], statsGates: 1 },
        'adder'     : { outputs: { cOut: '((a ^ b) & cIn) | (a & b)', q: '(a ^ b) ^ cIn' }, inputs: [ 'a', 'b', 'cIn' ], statsGates: 5  },
        'mux'       : { outputs: { q: '(~select & a) | (select & b)' }, inputs: [ 'select', 'a', 'b' ], statsGates: 5 }, // stats: 2 and, 1 or, 1 not, 1 buffer to balance not
        'mux3'       : { outputs: { q: '(~select & a) | (select & b)' }, signals: { q: 'enable' }, inputs: [ 'select', 'enable', 'a', 'b' ], statsGates: 5 },
        'demux'     : { outputs: { qa: '(~select & data)', qb: '(select & data)' }, inputs: [ 'select', 'data' ], statsGates: 4 }, // stats: 2 and, 1 not, 1 buffer to balance not
        'demux3'    : { outputs: { qa: '(~select & data)', qb: '(select & data)' }, signals: { qa: 'enable & ~select', qb: 'enable & select' }, inputs: [ 'select', 'enable', 'data' ], statsGates: 4 },
    };

    #debug;
    #checkConflict;
    #ioMap = new Map();
    #nets = [];
    #gates = [];
    #clocks = [];
    #consts = [];
    #compiled;
    #alloc8Base = 0;
    #alloc32Base = 0;
    #mem8;
    #mem32;

    constructor(debug = false, checkConflict = false) {
        assert.bool(debug);
        assert.bool(checkConflict);
        this.#debug = debug;
        this.#checkConflict = checkConflict;
    }

    // Declares a net (which inputs/outputs are connected) and returns the net-index. Attached IO-names must include their suffixes. Meta can be any custom data.
    declareNet(attachedIONames, meta) {
        assert.array(attachedIONames, false, (i) => assert.string(i));
        assert(attachedIONames.length > 0);
        this.#nets.push({ offset: this.#alloc8(), io: attachedIONames, meta });
        return this.#nets.length - 1;
    }

    // Declares a basic builtin gate-like function and returns the gate-index. Suffix is appended to the builtin's pre-defined IO-names.
    declareBuiltin(type, suffix) {
        assert.string(type);
        assert.string(suffix);
        const rules = Simulation.BUILTIN_MAP[type];
        const replacer = (_, mode, ident) => {
            const name = ident + suffix;
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
        const inputs = rules.inputs.map((i) => i + suffix);
        const outputs = { };
        const signals = { };
        for (const [ name, eq ] of pairs(rules.outputs)) {
            outputs[name + suffix] = eq.replace(/(\+|\-|\b)([a-z]+)\b/gi, replacer);
            signals[name + suffix] = ((rules.signals ?? { })[name] ?? '').replace(/(\+|\-|\b)([a-z]+)\b/gi, replacer);
        }
        this.#gates.push({ inputs, outputs, signals, type });
        for (const input of values(inputs)) {
            this.#declareIO(input, 'i', true);
        }
        for (const output of keys(outputs)) {
            this.#declareIO(output, 'o', false);
        }
        return this.#gates.length - 1;
    }

    // Declares a clock with the given frequency at the given tps. Suffix is appended to the clock's `enable` input and `c` output.
    declareClock(frequency, tps, suffix) {
        assert.number(frequency);
        assert.integer(tps);
        assert.string(suffix);
        const input = 'enable' + suffix;
        const output = 'c' + suffix
        this.#clocks.push({ frequency, tps, input, output, offset: this.#alloc32() });
        this.#declareIO(input, 'i', true);
        this.#declareIO(output, 'o', false);
        return this.#clocks.length - 1;
    }

    // Declares a gate with the given inputs/output and returns the gate-index. For convenience, suffix is appended to all IO-names.
    declareGate(type, inputNames, outputName, suffix) {
        assert.string(type);
        assert.string(suffix);
        assert.array(inputNames, false, (i) => assert.string(i));
        assert.string(outputName);
        const rules = Simulation.GATE_MAP[type];
        const inputs = inputNames.map((i) => i + suffix);
        const output = outputName + suffix;
        const inner = inputs.map((v) => (rules.negIn ? '(~' + v + ')' : v)).join(' ' + rules.joinOp + ' ');
        const outputs = { };
        outputs[output] = rules.negOut ? '(~(' + inner + '))' : inner;
        const signals = { };
        signals[output] = '';
        this.#gates.push({ inputs, outputs, signals, type });
        for (const input of inputs) {
            this.#declareIO(input, 'i', false);
        }
        this.#declareIO(output, 'o', true);
        return this.#gates.length - 1;
    }

    // Declares a push/pull resistor. Suffix is appended to the resistory's `q` output.
    declarePullResistor(type, suffix) {
        assert.enum([ 'up', 'down' ], type);
        assert.string(suffix);
        this.#declareIO('q' + suffix, type === 'up' ? 'u' : 'd', false);
    }

    // Declares a constant. Constants can be updated using setConst without recompiling the simulation. Suffix is appended to the constant's `q` output.
    declareConst(initialValue, outputName, suffix) {
        assert.integer(initialValue, true);
        assert.string(outputName);
        assert.string(suffix);
        const output = outputName + suffix
        this.#consts.push({ initialValue, output, offset: this.#alloc8() });
        this.#declareIO(output, 'o', false);
        return this.#consts.length - 1;
    }

    // Compiles the circuit and initializes memory, making it ready for simulate().
    compile(rawMem = null) {
        assert.object(rawMem, true, (o) => {
            assert.class(Uint8Array, o.mem8);
            assert.class(Int32Array, o.mem32);
            assert(o.mem8.length === this.#alloc8Base, 'incompatible u8 memory size');
            assert(o.mem32.length === this.#alloc32Base, 'incompatible i32 memory size');
        });
        this.#compileFunction();
        this.#mem8 = rawMem?.mem8 ?? new Uint8Array(this.#alloc8Base);
        this.#mem32 = rawMem?.mem32 ?? new Int32Array(this.#alloc32Base);
        if (!rawMem?.mem32) {
            for (const clock of this.#clocks) {
                const ticks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
                this.#mem32[clock.offset] = ticks + 2; // clean up first clock cycle (clock triggers on 0 but counter resets at -1)
            }
            for (const constant of this.#consts) {
                this.#mem8[constant.offset] = (constant.initialValue !== null) << Simulation.SIGNAL_SHIFT | (constant.initialValue & 1);
            }
        }
    }

    // Sets the value of a defined constant.
    setConstValue(index, value) {
        assert.integer(index);
        assert.integer(value, true);
        const offset = this.#getConst(index).offset;
        this.#mem8[offset] = (value !== null) << Simulation.SIGNAL_SHIFT | (value & 1);
    }

    // Gets the value of a defined constant.
    getConstValue(index) {
        assert.integer(index);
        const offset = this.#getConst(index).offset;
        const value = this.#mem8[offset];
        return value & (1 << Simulation.SIGNAL_SHIFT) ? value & 1 : null;
    }

    // Sets the frequency of a defined clock.
    setClockFrequency(index, frequency = null, tps = null, recompile = true) {
        assert.integer(index);
        assert.number(frequency, true);
        assert.integer(tps, true);
        const clock = this.#getClock(index);
        const previousMaxTicks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
        // set new frequency/tps to compute ticks/cycle
        if (tps !== null) {
            clock.tps = tps;
        }
        if (frequency !== null) {
            clock.frequency = frequency;
        }
        // new tps will not change the tick counter for the current cycle, so we have to fix that as well
        const newMaxTicks = Simulation.#computeClockTicks(clock.tps, clock.frequency);
        const remainingTicks = this.#mem32[clock.offset];
        this.#mem32[clock.offset] = 0 | (remainingTicks * newMaxTicks / previousMaxTicks);
        if (recompile) {
            this.#compileFunction(); // TODO: remove once todo in compileClock is done
        }
    }

    // Updates all clocks in the circuit for the given TPS and recompiles the simulation without resetting it.
    updateClocks(tps) {
        assert.integer(tps);
        for (let index = 0; index < this.#clocks.length; ++index) {
            this.setClockFrequency(index, null, tps, false);
        }
        this.#compileFunction(); // TODO: remove once todo in compileClock is done
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
        this.#mem8[offset] = ((value !== null) << Simulation.SIGNAL_SHIFT) | value;
    }

    // Gets the value of a net in the simulation. null indicates there is no signal, -1 a signal conflict, 0/1 normal state.
    getNetValue(index) {
        assert.integer(index);
        const offset = this.#getNet(index).offset;
        const value = this.#mem8[offset];
        return (value & (1 << (Simulation.SIGNAL_SHIFT + 1))) ? -1 : (value & (1 << Simulation.SIGNAL_SHIFT) ? value & 1 : null);
    }

    // Returns raw simulation memory.
    rawMem() {
        return { mem8: this.#mem8, mem32: this.#mem32 };
    }

    // Returns code of the simulation for debugging purposes.
    debugCode() {
        const compiled = this.#compileTick();
        return "// alloc mem[" + this.#alloc8Base + "]\n" + compiled;
    }

    // Returns current memory contents for debugging purposes.
    debugMem() {
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
    #declareIO(name, type, hasDelay) {
        assert.string(name);
        assert.string(type);
        assert.bool(hasDelay);
        if (!/^[a-z_@][a-z0-9_@]*$/i.test(name)) {
            throw new Error('Invalid io name "' + name + '"');
        }
        this.#ioMap.set(name, {
            offset: this.#alloc8(),
            delay: hasDelay ? 1 : 0,
            in: type.indexOf('i') !== -1,
            out: type.indexOf('o') !== -1,
            pull: type.indexOf('u') !== -1 ? 1 : (type.indexOf('d') !== -1 ? 0 : null),
        });
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
            // 0 delay path, not much to do (note: never used if OPTIMIZE_0TICK_INPUTS is true)
            return `${inputMem} = ${netMem}`;
        }
    }

    // Compiles an output to net assertion.
    #compileResistorToNet(netIndex, ioName) {
        const output = this.#getIO(ioName);
        const netMem = this.#compileNetAccess(netIndex);
        const signalMask = this.#compileValue(1 << Simulation.SIGNAL_SHIFT);
        const pullConst = this.#compileValue(1 << Simulation.SIGNAL_SHIFT | output.pull);
        let code = `signal = ${netMem} & ${signalMask}; `;                      // select only the signal bit of the NET
        code += `mask = signal | (signal >> ${Simulation.SIGNAL_SHIFT}); `;        // duplicate signal bit into data bit to build a mask
        code += `${netMem} = (${netMem} & mask) | (${pullConst} & ~mask)`;      // apply pull-value to net if NET signal is not set
        return code;
    }

    // Compiles a gate reading from one or more inputs and writing to an output.
    #compileGate(gateIndex, ioReplacements) {
        const gate = this.#gates[gateIndex];
        const result = [];
        for (const name of keys(gate.outputs)) {
            const outputDelay = this.#getIO(name).delay;
            const dataOp = gate.outputs[name].replace(/\b[a-z_@][a-z0-9_@]*\b/gi, (match) => ioReplacements[match] ?? 'error');
            const signalOp = gate.signals[name].replace(/\b[a-z_@][a-z0-9_@]*\b/gi, (match) => ioReplacements[match] ?? 'error');
            const outputMem = this.#compileIOAccess(name);
            let computeSignal;
            if (outputDelay > 0) {
                // perform signal computation, if required, otherwise just set the newest signal bit slot
                const signalShift = Simulation.SIGNAL_SHIFT + outputDelay;
                const signalBit = this.#compileValue(1 << signalShift);
                if (signalOp !== '') {
                    // perform signal computation, then shift result into newest signal bit slot
                    computeSignal = `((${signalOp}) << ${signalShift}) & ${signalBit}`;
                } else {
                    computeSignal = `${signalBit}`;
                }
                // perform data computation, then shift result into newest data bit slot and join both result parts
                const dataShift = outputDelay;
                const dataBit = this.#compileValue(1 << dataShift);
                const computeData = `((${dataOp}) << ${dataShift}) & ${dataBit}`;
                // unset previously newest signal and data bits and replace with newly computed ones, write back
                const clearMask = this.#compileDelayMask(outputDelay);
                result.push(`${outputMem} = ((${outputMem} >> 1) & ${clearMask}) | ((${computeSignal}) | (${computeData}))`);
            } else {
                // optimized path for 0 delay outputs
                const signalShift = Simulation.SIGNAL_SHIFT;
                const signalBit = this.#compileValue(1 << signalShift);
                const dataBit = this.#compileValue(1);
                if (signalOp !== '') {
                    computeSignal = `((${signalOp}) << ${signalShift})`; // skipping masking with signalBit here since the shift ensures it can't leak into data
                } else {
                    computeSignal = `${signalBit}`;
                }
                result.push(`${outputMem} = ${computeSignal} | ((${dataOp}) & ${dataBit})`); // not skipping masking with dataBit here since some builtins would leak data into signal
            }
        }
        return result.join('; ');
    }

    // Compiles a clock reading from one input and writing to an output.
    #compileClock(clockIndex, ioReplacements) {
        const clock = this.#clocks[clockIndex];
        const inputMem = ioReplacements[clock.input];
        const outputMem = this.#compileIOAccess(clock.output);
        const clockMem = 'mem32[' + clock.offset + ']'
        const signalBit = this.#compileValue(1 << Simulation.SIGNAL_SHIFT);
        const ticks = Simulation.#computeClockTicks(clock.tps, clock.frequency); // TODO move to mem32 so it can be updated without recompilation
        let code = `${clockMem} -= 1; `                                                         // decrement clock
        code += `cmask = ${clockMem} >> 31; `                                                   // copy sign bit into entire mask
        code += `${clockMem} = ((${clockMem} & ~cmask) | (${ticks} & cmask)); `;                // either retain current clock value or reset it to ticks on reaching -1
        code += `${outputMem} = ${signalBit} | (${inputMem} & (${outputMem} ^ !${clockMem}))`;  // flip output mem each time the clock reaches 0
        return code;
    }

    // Compiles a const writing to an output.
    #compileConst(constIndex) {
        const constant = this.#consts[constIndex];
        const outputMem = this.#compileIOAccess(constant.output);
        const constMem = 'mem[' + constant.offset + ']';
        return `${outputMem} = ${constMem}`; // TODO optimize, skip output mem
    }

    // Compiles an output to net assertion.
    #compileOutputToNet(netIndex, ioName, reset) {
        const netMem = this.#compileNetAccess(netIndex);
        const outputMem = this.#compileIOAccess(ioName);
        const signalMask = this.#compileValue(1 << Simulation.SIGNAL_SHIFT);
        let code = `signal = ${outputMem} & ${signalMask}; `;                       // select only the signal bit of the OUTPUT
        const maskCode = `signal | (signal >> ${Simulation.SIGNAL_SHIFT})`;            // duplicate signal bit into data bit to build a mask
        if (reset) {
            code += `${netMem} = (${outputMem} & (${maskCode}))`;                   // reset net to io-data/signal on first assert to net
        } else {
            code += `mask = ${maskCode}; `;
            code += `${netMem} = (${netMem} & ~mask) | (${outputMem} & mask)`;      // apply io-data/signal to net if OUTPUT signal is set
            if (this.#checkConflict) {
                code += ` | ((${netMem} & ${outputMem} & ${signalMask}) << 1)`;
            }
        }
        return code;
    }

    // Compiles and returns code to tick all gates once.
    #compileTick() {
        let result = ''
        // copy net-state to connected ports
        const directNetIO = new Map();
        for (const [ netIndex, net ] of pairs(this.#nets)) {
            for (const name of net.io) {
                const io = this.#getIO(name);
                if (io.in) {
                    // skip 0-tick inputs: we modify ioReplacements to have these directly read from the net
                    if (Simulation.OPTIMIZE_0TICK_INPUTS && io.delay === 0) {
                        directNetIO.set(name, netIndex);
                    } else if (io.delay > 0) {
                        result += this.#compileNetToInput(name, netIndex) + this.#endl('tick and set ' + name + ' from net ' + netIndex);
                    }
                }
            }
        }
        // process inputs using defined gates
        const ioReplacements = { };
        for (const [ name, io ] of pairs(this.#ioMap)) {
            const netIndex = directNetIO.get(name);
            // skip 0-tick inputs: if this input is in the list of 0-tick inputs replace input with net access
            if (netIndex !== undefined) {
                ioReplacements[name] = this.#compileNetAccess(netIndex);
            } else {
                ioReplacements[name] = this.#compileIOAccess(name);
            }
        }
        for (const [ constIndex, constant ] of pairs(this.#consts)) {
            result += this.#compileConst(constIndex) + this.#endl('const ' + constant.output, true);
        }
        for (const [ clockIndex, clock ] of pairs(this.#clocks)) {
            result += this.#compileClock(clockIndex, ioReplacements) + this.#endl('clock ' + clock.output, true);
        }
        for (const [ gateIndex, gate ] of pairs(this.#gates)) {
            result += this.#compileGate(gateIndex, ioReplacements) + this.#endl('compute ' + gate.type, true);
        }
        // copy port-state to attached net
        for (const [ netIndex, net ] of pairs(this.#nets)) {
            // write normal outputs to nets, also have first write just reset it (less code)
            let resetNet = true;
            for (const name of net.io ) {
                if (this.#getIO(name).out) {
                    result += this.#compileOutputToNet(netIndex, name, resetNet) + this.#endl((resetNet ? 're' : '') + 'set net ' + netIndex + ' from ' + name);
                    resetNet = false;
                }
            }
            // write resistor output to nets (these only write if the net has no signal)
            for (const name of values(net.io)) {
                const pull = this.#getIO(name).pull;
                if (pull !== null) {
                    result += this.#compileResistorToNet(netIndex, name) + this.#endl('pull net ' + netIndex + (pull ? 'up' : 'down') + ' from ' + name);
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

    // Returns code for a bitmask with the signal and data bits for the given delay being unset.
    #compileDelayMask(delay) {
        const clearDataMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << delay);
        const clearSignalMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << (Simulation.SIGNAL_SHIFT + delay));
        return this.#compileValue(clearSignalMask & clearDataMask);
    }

    // Returns code for a constant (written in binary notation for better readability of compiled code).
    #compileValue(value) {
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

    // Returns a const declaration.
    #getConst(index) {
        let constant;
        if ((constant = this.#consts[index]) !== undefined) {
            return constant;
        } else {
            throw new Error('Undefined constant ' + index);
        }
    }

    // Computes number of ticks between clock edges.
    static #computeClockTicks(tps, frequency) {
        return 0 | (tps / frequency / 2);
    }
}