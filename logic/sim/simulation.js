"use strict";

// Handles compiling and running the actual simulation.
class Simulation {

    static DEBUG = true;

    static DEFAULT_DELAY = 1;
    static ARRAY_CONSTRUCTOR = Uint8Array;
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
        'xnor'  : { negIn: false, negOut: false, joinOp: '===' },
    };

    static BUILTIN_MAP = {
        'latch' : { template: '(l & d) | (~l & q)', inputs: [ 'l', 'd' ], output: 'q' },
    }

    #allocBase = 0;
    #ioMap = new Map();
    #nets = [];
    #gates = [];
    #compiled;
    #mem;

    // Declares a net (which inputs/outputs are connected) and returns the net-index. meta can be any custom data.
    netDecl(attachedIONames, meta) {
        assert.array(attachedIONames, false, (i) => assert.string(i));
        const index = this.#nets.length;
        this.#nets.push({ offset: this.#alloc(), io: attachedIONames, meta });
        return index;
    }

    // Declares a named input or output.
    ioDecl(name, type, delay = null) {
        assert.string(name);
        assert.string(type);
        assert.number(delay, true);
        if (!/^[a-z_][a-z0-9_@]*$/.test(name)) {
            throw new Error('Invalid io name "' + name + '"');
        }
        this.#ioMap.set(name, { offset: this.#alloc(), delay: delay ?? Simulation.DEFAULT_DELAY, in: type.indexOf('i') !== -1, out: type.indexOf('o') !== -1 });
    }

    // Declares a basic builtin gate-like function.
    builtinDecl(type, suffix, delay = null) {
        assert.string(type);
        assert.string(suffix);
        assert.number(delay, true);
        let rules = Simulation.BUILTIN_MAP[type];
        let template = rules.template.replace(/([a-z])/g, (m) => m + suffix);
        let inputs = rules.inputs.map((i) => i + suffix);
        let output = rules.output + suffix;
        this.#gates.push({ inputs, output: output, template });

        for (let input of inputs) {
            this.ioDecl(input, 'i', delay ?? Simulation.DEFAULT_DELAY);
        }

        this.ioDecl(output, 'o', delay ?? Simulation.DEFAULT_DELAY);
    }

    // Declares a gate with the given inputs/output.
    gateDecl(type, inputs, output, delay = null) {
        assert.string(type);
        assert.array(inputs, false, (i) => assert.string(i));
        assert.string(output);
        assert.number(delay, true);
        let rules = Simulation.GATE_MAP[type];
        let inner = inputs.map((v) => (rules.negIn ? '(!' + v + ')' : v)).join(' ' + rules.joinOp + ' '); // TODO: I have '1 &' only on negOut, why?
        let template = rules.negOut ? '!(1 & (' + inner + '))' : inner;
        this.#gates.push({ inputs, output, template });

        for (let input of inputs) {
            this.ioDecl(input, 'i', delay ?? Simulation.DEFAULT_DELAY);
        }

        this.ioDecl(output, 'o', delay ?? Simulation.DEFAULT_DELAY);
    }

    // Compiles the circuit to a function.
    compile() {
        let result = "'use strict';(mem) => {\n";
        result += 'let mask, signal, result' + this.#endl();
        result += this.#compileTick();
        result += '}';
        this.#compiled = eval(result);
        this.#mem = new Simulation.ARRAY_CONSTRUCTOR(this.#allocBase);
    }

    // Returns code for the simulation.
    code() {
        const compiled = this.#compileTick();
        return "// alloc mem[" + this.#allocBase + "]\n" + compiled;
    }

    // Returns whether the simulation is ready to run (has been compiled).
    get ready() {
        return typeof this.#compiled === 'function';
    }

    // Runs the simulation.
    simulate() {
        this.#compiled(this.#mem);
    }

    // Sets the value of a net in the simulation. null to unset, true/false/1/0 to set value.
    setNet(netIndex, value) {
        assert.number(netIndex);
        assert.number(value, true);
        //console.log('set ' + netIndex + ' to ' + value);
        let offset = this.#nets[netIndex].offset;
        this.#mem[offset] = ((value !== null) << Simulation.MAX_DELAY) | value;
    }

    // Gets the value of a net in the simulation.
    getNet(netIndex) {
        assert.number(netIndex);
        let offset = this.#nets[netIndex].offset;
        let value = this.#mem[offset];
        let ret = value & (1 << Simulation.MAX_DELAY) ? value & 1 : null;
        //console.log('get ' + netIndex + ' = ' + ret);
        return ret;
    }

    // Returns a list of defined nets.
    get nets() {
        return this.#nets;
    }

    // Compiles a net to input assertion.
    #compileNetToInput(name, netIndex) {
        let io = this.#getIO(name);
        let netValue = this.#compileNetValue(netIndex);
        let ioValue = this.#compileIOValue(name);
        let delayMask = this.#compileDelayMask(io.delay);
        // TODO: perf test: write back to temporary, then after computation back to input
        return `${ioValue} = (${ioValue} & ${delayMask}) | (${netValue} << ${io.delay})`;   // shift net value up to newest io-data/signal bits and apply
    }

    // Compiles a gate reading from one or more inputs and writing to an output.
    #compileGate(gateIndex, ioReplacements) {
        let gate = this.#gates[gateIndex];
        let io = this.#getIO(gate.output);
        let op = gate.template.replace(/[a-z_][a-z0-9_@]*/g, (match) => ioReplacements[match] ?? 'error');
        let ioValue = this.#compileIOValue(gate.output);
        let delayMask = this.#compileDelayMask(io.delay);
        let signalBit = this.#compileConst(1 << Simulation.MAX_DELAY);
        let code = `result = ${signalBit} | (${op}); `;                                     // set signal bit on computed result
        // TODO: perf test: first write back io state (see todo in compileNetToInput)
        code += `${ioValue} = (${ioValue} & ${delayMask}) | (result << ${io.delay})`;       // shift result up to newest io-data/signal bits and apply
        return code;
    }

    // Compiles an output to net assertion.
    #compileOutputToNet(netIndex, name) {
        let io = this.#getIO(name);
        let netSignalBit = Simulation.MAX_DELAY;           // oldest net signal bit (also the only signal bit for nets)
        let ioSignalBit = Simulation.MAX_DELAY + io.delay  // newest io signal bit
        let netValue = this.#compileNetValue(netIndex);
        let ioValue = this.#compileIOValue(name);
        let code = `signal = (${ioValue} & (1 << ${ioSignalBit})) >> ${ioSignalBit}; `;     // do we have a signal on the output?
        code += `mask = ~(signal | (signal << ${netSignalBit})); `;                        // build mask for oldest (and only) net-data/signal from io-signal (all bits enabled if no signal)
        code += `${netValue} = (${netValue} & mask) | (${ioValue} & ~mask)`;                // apply io-data/signal to net if signal is set
        return code;
    }

    // Compiles code to tick gates once.
    #compileTick() {
        let result = ''
        // advance time for all ports
        for (const [ name ] of this.#ioMap) {
            result += this.#compileIOValue(name) + ' >>= 1' + this.#endl('tick ' + name);
        }
        // copy net-state to connected ports
        for (const [ netIndex, net ] of this.#nets.entries()) {
            for (const name of net.io) {
                if (this.#getIO(name).in) {
                    result += this.#compileNetToInput(name, netIndex) + this.#endl('set port ' + name + ' from net ' + netIndex);
                }
            }
        }
        // process inputs using defined gates
        let ioReplacements = { };
        for (const [ name ] of this.#ioMap) {
            ioReplacements[name] = this.#compileIOValue(name);
        }
        for (const [ gateIndex, gate ] of this.#gates.entries()) {
            result += this.#compileGate(gateIndex, ioReplacements) + this.#endl('compute ' + gate.template);
        }
        // copy port-state to attached net
        for (const [ netIndex, net ] of this.#nets.entries()) {
            for (const name of net.io ) {
                if (this.#getIO(name).out) {
                    result += this.#compileOutputToNet(netIndex, name) + this.#endl('set net ' + netIndex + ' from port ' + name);
                }
            }
        }
        return result;
    }

    // Retuns code to refer to an IO state.
    #compileIOValue(name) {
        return 'mem[' + this.#getIO(name).offset + ']';
    }

    // Returns code to refer to the state of a net.
    #compileNetValue(index) {
        return 'mem[' + this.#nets[index].offset + ']';
    }

    // Returns code for a bitmask with the signal and data bits for the given delay being unset.
    #compileDelayMask(delay) {
        let clearDataMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << delay);
        let clearSignalMask = ((1 << Simulation.ARRAY_BITS) - 1) & ~(1 << (Simulation.MAX_DELAY + delay));
        return this.#compileConst(clearSignalMask & clearDataMask);
    }

    // Returns code for a constant (written in binary notation for better readability of compiled code).
    #compileConst(value) {
        let result = '0b';
        for (let i = Simulation.ARRAY_BITS - 1; i >= 0; --i) {
            result += ((value & (1 << i)) > 0 ? '1' : '0');
        }
        return result;
    }

    // Returns a semicolon followed by an optional comment if DEBUG is set and a newline.
    #endl(comment) {
        return '; ' + (Simulation.DEBUG && comment ? '// ' + comment : '') + "\n";
    }

    // Returns an input/output declaration.
    #getIO(name) {
        let def;
        if ((def = this.#ioMap.get(name)) !== undefined) {
            return def;
        } else {
            throw new Error('Undefined IO ' + name);
        }
    }

    // Allocates memory for a single port or net.
    #alloc() {
        return this.#allocBase++;
    }
}