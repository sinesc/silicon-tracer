// Global data.
class GlobalState {
    // Globallay unique net id.
    static netId = 0;
    // Globally unique port id.
    static portId = 0;
    // Maps port ids to circuits.
    static todo;

    static allocBase = 0;
    static allocMem;

    // Simulation granularity
    static ARRAY_CONSTRUCTOR = Uint8Array;
    static ARRAY_BITS = 8;
    static MAX_DELAY = GlobalState.ARRAY_BITS / 2;

}

// Actual net data, accessed through a Net instance.
class NetData {
    // Id of this net.
    id;
    // Connected ports.
    portIds;
    // Constructs a new net.
    constructor() {
        this.id = GlobalState.netId++;
        this.portIds = [];
    }
}

// References net-data so that connections can have their nets merged without having to update the components.
class Net {
    // Reference to the actual net data
    data;

    // Construct a new net.
    constructor() {
        this.data = new NetData;
    }

    // Returns ids of connected ports.
    get portIds() {
        return this.data.portIds;
    }

    // Returns the id of this net.
    get id() {
        return this.data.id;
    }

    // Adds a port id to the net.
    addPortId(id) {
        this.data.portIds.push(id);
    }

    // Removes a port id from the net if present.
    removePortId(id) {
        let index = this.data.portIds.findIndex(id);
        if (index > -1) {
            if (this.data.portIds.length > 1) {
                this.data.portIds[index] = this.data.portIds.pop();
            } else {
                this.data.portIds.pop();
            }
            return true;
        }
        return false;
    }
}

// A port connected to a net. Holds a reference to its circuit.
class NetPort { // TODO: needs to be more like a map, maybe just use a weakmap(id => circuit)?
    id;
    circuit;
    constructor(circuit) {
        this.id = GlobalState.portId++; // FIXME: port id should probably be incremented on component
        this.circuit = circuit;
    }

}

// A circuit is either a basic gate definition or a schematic for a component.
class Circuit {
    // External connections of this circuit.
    ports;
    // Name of this circuit.
    name;
    // Nets contained in the circuit. // TODO: or lines? need wire coords, not just nets
    nets;
    // Other circuits contained in this circuit.
    circuits;

    // or maybe just
    items; // contains wires+circuits and nets are computed on demand

    // Constructs a new circuit with the given name and ports. Name must be unique
    constructor(name, ports) {
        this.name = name;
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports };
    }
    // Drops this circuit as a component onto the grid.
    createComponent(grid, x, y) {
        let component = new Component(grid, this.name, x, y, this);
        return component;
    }
    // Creates the circuit on the given grid. Normally the grid should be cleared first.
    createSchematic(grid) {
        // TODO: how to recreate connections from here? nets need connections then
    }
}

class Compilable {

    static DEBUG = true;
    static DEFAULT_DELAY = 1;
    static GATE_MAP = {
        'not'   : { negIn: false, negOut: true,  joinOp: null },
        'and'   : { negIn: false, negOut: false, joinOp: '&' },
        'nand'  : { negIn: false, negOut: true,  joinOp: '&' },
        'or'    : { negIn: false, negOut: false, joinOp: '|' },
        'nor'   : { negIn: false, negOut: true,  joinOp: '|' },
        'xor'   : { negIn: false, negOut: false, joinOp: '^' },
        'xnor'  : { negIn: false, negOut: false, joinOp: '===' },
    };

    ioMap = new Map();
    nets = [];
    gates = [];
    sim;

    // Declares an input or output.
    ioDecl(name, type, delay) {
        this.ioMap.set(name, { offset: this.alloc(), delay: delay ?? Compilable.DEFAULT_DELAY, in: type.indexOf('i') !== -1, out: type.indexOf('o') !== -1 });
    }

    // Returns an input/output declaration.
    io(name) {
        let def;
        if ((def = this.ioMap.get(name)) !== undefined) {
            return def;
        } else {
            throw 'Undefined IO ' + name;
        }
    }

    // Declares a net (which inputs/outputs are connected).
    netDecl(attachedIONames) {
        const index = this.nets.length;
        this.nets.push({ offset: this.alloc(), io: attachedIONames });
        return index;
    }

    // Declares a gate function for the given inputs/output.
    gateDecl(type, inputs, output) {
        let rules = Compilable.GATE_MAP[type];
        let inner = inputs.map((v) => (rules.negIn ? '(!' + v + ')' : v)).join(' ' + rules.joinOp + ' ');
        let template = rules.negOut ? '!(1 & (' + inner + '))' : inner;
        const index = this.nets.length;
        this.gates.push({ inputs, output, template });
        return index;
    }

    compileIO(name) {
        return 'mem[' + this.io(name).offset + ']';
    }
    compileNet(index) {
        return 'mem[' + this.nets[index].offset + ']';
    }
    compileNetToInput(name, net) {
        if (typeof name !== 'string') {
            throw 'Expected io name as first argument';
        }
        let io = this.io(name);
        let netValue = this.compileNet(net);
        let ioValue = this.compileIO(name);
        let delayMask = this.delayMask(io.delay);
        return `${ioValue} = (${ioValue} & ${delayMask}) | (${netValue} << ${io.delay})`;   // shift net value up to newest io-data/signal bits and apply
    }
    compileGate(gate, ioReplacements) {
        let io = this.io(gate.output);
        let op = gate.template.replace(/[a-z_][a-z0-9_]*/g, (match) => ioReplacements[match]);
        let ioValue = this.compileIO(gate.output);
        let delayMask = this.delayMask(io.delay);
        let signalBit = this.binConst(1 << GlobalState.MAX_DELAY);
        let code = `result = ${signalBit} | (${op}); `;                                     // set signal bit on computed result
        code += `${ioValue} = (${ioValue} & ${delayMask}) | (result << ${io.delay})`;       // shift result up to newest io-data/signal bits and apply
        return code;
    }
    compileOutputToNet(net, name) {
        if (typeof net !== 'number') {
            throw 'Expected net index as first argument';
        }
        let io = this.io(name);
        let netSignalBit = GlobalState.MAX_DELAY;           // oldest net signal bit (also the only signal bit for nets)
        let ioSignalBit = GlobalState.MAX_DELAY + io.delay  // newest io signal bit
        let netValue = this.compileNet(net);
        let ioValue = this.compileIO(name);
        let code = `signal = (${ioValue} & (1 << ${ioSignalBit})) >> ${ioSignalBit}; `;     // do we have a signal on the output?
        code += `mask = ~(signal | (signal << ${netSignalBit})); `;                        // build mask for oldest (and only) net-data/signal from io-signal (all bits enabled if no signal)
        code += `${netValue} = (${netValue} & mask) | (${ioValue} & ~mask)`;                // apply io-data/signal to net if signal is set
        return code;
    }

    // Compiles code to tick gates once.
    compileTick() {
        let result = ''
        // advance time for all ports
        for (const [ name ] of this.ioMap) {
            result += this.compileIO(name) + ' >>= 1' + this.endl('tick ' + name);
        }
        // copy net-state to connected ports
        for (const [ netIndex, net ] of this.nets.entries()) {
            for (const name of net.io) {
                if (this.io(name).in) {
                    result += this.compileNetToInput(name, netIndex) + this.endl('set port ' + name + ' from net ' + netIndex);
                }
            }
        }
        // process inputs using defined gates
        let ioReplacements = { };
        for (const [ name ] of this.ioMap) {
            ioReplacements[name] = this.compileIO(name);
        }
        for (const gate of this.gates) {
            result += this.compileGate(gate, ioReplacements) + this.endl('compute ' + gate.template);
        }
        // copy port-state to attached net
        for (const [ netIndex, net ] of this.nets.entries()) {
            for (const name of net.io ) {
                if (this.io(name).out) {
                    result += this.compileOutputToNet(netIndex, name) + this.endl('set net ' + netIndex + ' from port ' + name);
                }
            }
        }
        return result;
    }
    // Compiles the circuit to a function.
    compile() {
        let result = "function(mem) {\n";
        //result += 'if (!mem) throw "missing mem argument"' + this.endl();
        result += 'let mask, signal, result' + this.endl();
        result += this.compileTick();
        result += '}';
        console.log(result);
        this.simulate = eval('let result = ' + result + '; result');
    }

    // Sets the value of a net in the simulation. null to unset, true/false/1/0 to set value.
    setNet(mem, netIndex, value) {
        let offset = this.nets[netIndex].offset;
        mem[offset] = ((value !== null) << GlobalState.MAX_DELAY) | value;
    }
    // Gets the value of a net in the simulation.
    getNet(mem, netIndex) {
        let offset = this.nets[netIndex].offset;
        let value = mem[offset];
        return value & (1 << GlobalState.MAX_DELAY) ? value & 1 : null;
    }

    // Returns a bitmask with the signal and data bits for the given delay being unset.
    delayMask(delay) {
        let clearDataMask = ((1 << GlobalState.ARRAY_BITS) - 1) & ~(1 << delay);
        let clearSignalMask = ((1 << GlobalState.ARRAY_BITS) - 1) & ~(1 << (GlobalState.MAX_DELAY + delay));
        return this.binConst(clearSignalMask & clearDataMask);
    }

    // Converts value to binary notation (for readability of compiled code).
    binConst(value) {
        let result = '0b';
        for (let i = GlobalState.ARRAY_BITS - 1; i >= 0; --i) {
            result += ((value & (1 << i)) > 0 ? '1' : '0');
        }
        return result;
    }

    // Returns a semicolon followed by an optional comment if DEBUG is set and a newline.
    endl(comment) {
        return '; ' + (Compilable.DEBUG && comment ? '// ' + comment : '') + "\n";
    }

    // Allocates memory for a single port or net.
    alloc() {
        let base = GlobalState.allocBase;
        GlobalState.allocBase += 1;
        return base;
    }
}


class Gate {
    type;
    constructor(type) {
        this.type = type;
    }
}