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
        let component = new Component(grid, this.name, x, y, /*Math.floor(Math.random() * 4)*/0, this);
        return component;
    }
    // Creates the circuit on the given grid. Normally the grid should be cleared first.
    createSchematic(grid) {
        // TODO: how to recreate connections from here? nets need connections then
    }
}

class Gate {
    type;
    constructor(type) {
        this.type = type;
    }
}