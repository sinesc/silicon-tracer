"use strict";

// Handles compiling and running the actual simulation.
class Simulation {

    static DEBUG = true;

    static DEFAULT_DELAY = 1;
    static ARRAY_CONSTRUCTOR = Uint8Array;
    static ARRAY_BITS = 8;
    static MAX_DELAY = Simulation.ARRAY_BITS / 2;
    static DATA_BIT_MASK = (Simulation.ARRAY_BITS << 1) - 1;

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
        'latch' : { dataTpl: '(l & d) | (~l & q)', inputs: [ 'l', 'd' ], output: 'q' },
        'buffer3' : { dataTpl: 'd', signalTpl: 'e', inputs: [ 'e', 'd' ], output: 'q' },
        'not3' : { dataTpl: '~d', signalTpl: 'e', inputs: [ 'e', 'd' ], output: 'q' },
    }

    #allocBase = 0;
    #ioMap = new Map();
    #nets = [];
    #gates = [];
    #compiled;
    #mem;

    // Declares a net (which inputs/outputs are connected) and returns the net-index. Attached IO-names must include their suffixes. Meta can be any custom data.
    declareNet(attachedIONames, meta) {
        assert.array(attachedIONames, false, (i) => assert.string(i));
        this.#nets.push({ offset: this.#alloc(), io: attachedIONames, meta });
        return this.#nets.length - 1;
    }

    // Declares a basic builtin gate-like function and returns the gate-index. For convenience, suffix is appended to all IO-names.
    declareBuiltin(type, suffix, delay = null) {
        assert.string(type);
        assert.string(suffix);
        assert.number(delay, true);
        const rules = Simulation.BUILTIN_MAP[type];
        const dataTpl = rules.dataTpl.replace(/([a-z])/g, (m) => m + suffix);
        const signalTpl = (rules.signalTpl ?? '').replace(/([a-z])/g, (m) => m + suffix);
        const inputs = rules.inputs.map((i) => i + suffix);
        const output = rules.output + suffix;
        this.#gates.push({ inputs, output, dataTpl, signalTpl });
        for (const input of inputs) {
            this.#declareIO(input, 'i', delay ?? Simulation.DEFAULT_DELAY);
        }
        this.#declareIO(output, 'o', delay ?? Simulation.DEFAULT_DELAY);
        return this.#gates.length - 1;
    }

    // Declares a gate with the given inputs/output and returns the gate-index. For convenience, suffix is appended to all IO-names.
    declareGate(type, suffix, inputNames, outputName, delay = null) {
        assert.string(type);
        assert.string(suffix);
        assert.array(inputNames, false, (i) => assert.string(i));
        assert.string(outputName);
        assert.number(delay, true);
        const rules = Simulation.GATE_MAP[type];
        const inputs = inputNames.map((i) => i + suffix);
        const output = outputName + suffix;
        const inner = inputs.map((v) => (rules.negIn ? '(~' + v + ')' : v)).join(' ' + rules.joinOp + ' ');
        const dataTpl = rules.negOut ? '(~(' + inner + '))' : inner;
        const signalTpl = '';
        this.#gates.push({ inputs, output, dataTpl, signalTpl });
        for (const input of inputs) {
            this.#declareIO(input, 'i', delay ?? Simulation.DEFAULT_DELAY);
        }
        this.#declareIO(output, 'o', delay ?? Simulation.DEFAULT_DELAY);
        return this.#gates.length - 1;
    }

    // Compiles the circuit, making it ready for simulate().
    compile() {
        let result = "'use strict';(mem) => {\n";
        result += 'let mask, signal' + this.#endl();
        result += this.#compileTick();
        result += '}';
        this.#compiled = eval(result);
        this.#mem = new Simulation.ARRAY_CONSTRUCTOR(this.#allocBase);
    }

    // Runs the simulation for the given number of ticks.
    simulate(ticks = 1) {
        for (let i = 0; i < ticks; ++i) {
            this.#compiled(this.#mem);
        }
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

    // Sets the value of a net in the simulation. null to unset, true/false/1/0 to set value.
    setNetValue(index, value) {
        assert.number(index);
        assert.number(value, true);
        const offset = this.#getNet(index).offset;
        this.#mem[offset] = ((value !== null) << Simulation.MAX_DELAY) | value;
    }

    // Gets the value of a net in the simulation.
    getNetValue(index) {
        assert.number(index);
        const offset = this.#getNet(index).offset;
        const value = this.#mem[offset];
        return value & (1 << Simulation.MAX_DELAY) ? value & 1 : null;
    }

    // Returns code of the simulation for debugging purposes.
    code() {
        const compiled = this.#compileTick();
        return "// alloc mem[" + this.#allocBase + "]\n" + compiled;
    }

    // Returns current memory contents for debugging purposes.
    mem() {
        const result = { net: {}, io: {} };
        for (const [ name, io ] of this.#ioMap) {
            result.io[name] = this.#mem[io.offset];
        }
        for (const [ netIndex, net ] of this.#nets.entries()) {
            result.net[netIndex] = this.#mem[net.offset];
        }
        return result;
    }

    // Allocates memory for a single port or net.
    #alloc() {
        return this.#allocBase++;
    }

    // Declares a named input or output.
    #declareIO(name, type, delay = null) {
        assert.string(name);
        assert.string(type);
        assert.number(delay, true);
        if (!/^[a-z_][a-z0-9_@]*$/.test(name)) {
            throw new Error('Invalid io name "' + name + '"');
        }
        this.#ioMap.set(name, { offset: this.#alloc(), delay: delay ?? Simulation.DEFAULT_DELAY, in: type.indexOf('i') !== -1, out: type.indexOf('o') !== -1 });
    }

    // Compiles a net to input assertion.
    #compileNetToInput(ioName, netIndex) {
        const io = this.#getIO(ioName);
        const netMem = this.#compileNetAccess(netIndex);
        const inputMem = this.#compileIOAccess(ioName);
        const clearMask = this.#compileDelayMask(io.delay);
        return `${inputMem} = ((${inputMem} >> 1) & ${clearMask}) | (${netMem} << ${io.delay})`;   // shift net value up to newest io-data/signal bits and apply
    }

    // Compiles a gate reading from one or more inputs and writing to an output.
    #compileGate(gateIndex, ioReplacements) {
        const gate = this.#gates[gateIndex];
        const io = this.#getIO(gate.output);
        const dataOp = gate.dataTpl.replace(/[a-z_][a-z0-9_@]*/g, (match) => ioReplacements[match] ?? 'error');
        const signalOp = gate.signalTpl.replace(/[a-z_][a-z0-9_@]*/g, (match) => ioReplacements[match] ?? 'error');
        const outputMem = this.#compileIOAccess(gate.output);
        // perform signal computation, if required, otherwise just set the newest signal bit slot
        const signalShift = Simulation.MAX_DELAY + io.delay;
        const signalBit = this.#compileConst(1 << signalShift);
        let computeSignal;
        if (signalOp !== '') {
            // perform signal computation, then shift result into newest signal bit slot
            computeSignal = `((${signalOp}) << ${signalShift}) & ${signalBit}`;
        } else {
            computeSignal = `${signalBit}`;
        }
        // perform data computation, then shift result into newest data bit slot and join both result parts
        const dataShift = io.delay;
        const dataBit = this.#compileConst(1 << dataShift);
        const computeData = `((${dataOp}) << ${dataShift}) & ${dataBit}`;
        // unset previously newest signal and data bits and replace with newly computed ones, write back
        const clearMask = this.#compileDelayMask(io.delay);
        return `${outputMem} = ((${outputMem} >> 1) & ${clearMask}) | ((${computeSignal}) | (${computeData}))`;
    }

    // Compiles an output to net assertion.
    #compileOutputToNet(netIndex, ioName, reset) {
        const netMem = this.#compileNetAccess(netIndex);
        const outputMem = this.#compileIOAccess(ioName);
        const signalMask = this.#compileConst(1 << Simulation.MAX_DELAY);
        let code = `signal = ${outputMem} & ${signalMask}; `;                       // select only the signal bit
        code += `mask = signal | (signal >> ${Simulation.MAX_DELAY}); `;            // and duplicate it into the data bit position to create a mask
        if (reset) {
            code += `${netMem} = (${outputMem} & mask)`;                            // reset net to io-data/signal on first assert to net
        } else {
            code += `${netMem} = (${netMem} & ~mask) | (${outputMem} & mask)`;      // apply io-data/signal to net if signal is set
        }
        return code;
    }

    // Compiles code to tick gates once.
    #compileTick() {
        let result = ''
        // copy net-state to connected ports
        for (const [ netIndex, net ] of this.#nets.entries()) {
            for (const name of net.io) {
                if (this.#getIO(name).in) {
                    result += this.#compileNetToInput(name, netIndex) + this.#endl('tick and set ' + name + ' from net ' + netIndex);
                }
            }
        }
        // process inputs using defined gates
        const ioReplacements = { };
        for (const [ name ] of this.#ioMap) {
            ioReplacements[name] = this.#compileIOAccess(name);
        }
        for (const [ gateIndex, gate ] of this.#gates.entries()) {
            result += this.#compileGate(gateIndex, ioReplacements) + this.#endl('compute ' + gate.dataTpl);
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
        const clearSignalMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << (Simulation.MAX_DELAY + delay));
        return this.#compileConst(clearSignalMask & clearDataMask);
    }

    // Returns code for a constant (written in binary notation for better readability of compiled code).
    #compileConst(value) {
        if (Simulation.DEBUG) {
            let result = '0b';
            for (let i = Simulation.ARRAY_BITS - 1; i >= 0; --i) {
                result += ((value & (1 << i)) > 0 ? '1' : '0');
            }
            return result;
        } else {
            return '' + value;
        }
    }

    // Returns a semicolon followed by an optional comment if DEBUG is set and a newline.
    #endl(comment) {
        return '; ' + (Simulation.DEBUG && comment ? '// ' + comment.replace(/@(g[a-f0-9]+)@/g, (m, h) => ':' + h.substr(1, 6) + ':') : '') + "\n";
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
}