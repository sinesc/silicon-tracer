// Net management.
class Nets {
    // Globallay unique net id.
    static netId = 0;
    // Globally unique port id.
    static portId = 0;
}

// Actual net data, accessed through a Net instance.
class NetData {
    // Id of this net.
    id;
    // Connected ports.
    portIds;
    // Constructs a new net.
    constructor() {
        this.id = Nets.netId++;
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
class NetPort {
    id;
    circuit;
    constructor(circuit) {
        this.id = Nets.portId++; // FIXME: port id should probably be incremented on component
        this.circuit = circuit;
    }

}

// A circuit is either a basic gate definition or a schematic for a component.
class Circuit {
    ports;
    name;
    nets;
    circuits;
    constructor(name, ports) {
        this.name = name;
        this.ports = ports;
    }
    // Creates a renderable component that can be dropped onto the grid.
    createComponent(grid, x, y) {
        let component = new Component(grid, this.name, x, y, this);
        return component;
    }
    // Creates a schematic on the given grid from the contained nets and circuits.
    createSchematic(grid) {
        // TODO: how to recreate connections from here? nets need coords then
    }
}