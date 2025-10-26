"use strict";

// Single circuit
class Circuit {
    label;
    uid;
    data;
    ports;
    gridConfig;
    #netCache = null;

    constructor(label, uid = null, data = [], ports = [], gridConfig = {}) {
        this.label = label;
        this.uid = uid ?? crypto.randomUUID();
        this.data = data;
        this.ports = ports;
        this.gridConfig = gridConfig;
    }

    // Serializes a circuit for saving to file.
    serialize(ignore) {
        let data = [];
        for (let item of this.data) {
            let serialized = {};
            for (let [ key, value ] of Object.entries(item.serialize())) {
                if (!ignore.includes(key)) {
                    serialized[key] = value;
                }
            }
            data.push(serialized);
        }
        return { label: this.label, uid: this.uid, data, ports: this.ports, gridConfig: this.gridConfig };
    }

    // Unserializes circuit from decoded JSON-object.
    static unserialize(circuit) {
        let components = circuit.data.filter((i) => i._.c !== 'Grid').map((i) => GridItem.unserialize(i, null));
        let gridConfig = circuit.gridConfig ?? circuit.data.find((i) => i._.c === 'Grid'); // legacy
        return new Circuit(circuit.label, circuit.uid, components, circuit.ports, gridConfig);
    }

    // Identifies nets on the grid and returns a [ NetList, Map<String, Grid-less-Component> ].
    identifyNets() {
        if (this.#netCache) {
            return this.#netCache;
        }
        // get all individual wires
        let wires = this.data.filter((i) => i instanceof Wire).map((w) => {
            return new NetWire([ new Point(w.x, w.y), new Point(w.x + w.width, w.y + w.height) ], w.gid);
        });
        // get all component ports
        let components = this.data.filter((i) => !(i instanceof Wire));
        let ports = [];
        let componentMap = new Map();
        let id = 0;
        for (let component of components) {
            let componentPrefix = NetPort.prefix(id++);
            componentMap.set(componentPrefix, component);
            for (let port of component.getPorts()) {
                let { x, y } = port.coords(component.width, component.height, component.rotation);
                ports.push(new NetPort(new Point(x + component.x, y + component.y), componentPrefix, port.name, component.gid));
            }
        }
        let netList = NetList.fromWires(wires, ports, componentMap);
        return this.#netCache = netList;
    }

    // Invalidates grid nets and detaches components.
    invalidateNets() {
        this.#netCache = null;
    }
}

// Handles loading/saving/selecting circuits and keeping the grid updated.
class Circuits {

    static STRINGIFY_SPACE = "\t";

    #circuits;
    #currentCircuit;
    #grid;
    #fileHandle = null;
    #fileName = null;

    constructor(grid) {
        this.#grid = grid;
        this.clear();
    }

    // Loads circuits from file, returning the filename if circuits was previously empty.
    async loadFile(clear) {
        const haveCircuits = !this.allEmpty;
        const [ handle ] = await File.openFile(this.#fileHandle);
        const file = await handle.getFile();
        const content = JSON.parse(await file.text());
        if (clear) {
            this.#circuits = [ ];
        } else {
            this.#pruneEmpty();
        }
        const newCircuitIndex = this.#unserialize(content);
        this.#setGrid(this.#circuits[newCircuitIndex].uid);
        if (clear || !haveCircuits) {
            // no other circuits loaded, make this the new file handle
            this.#fileHandle = handle;
            this.#fileName = file.name;
            return file.name;
        } else {
            return null;
        }
    }

    // Saves circuits to previously opened file. Will fall back to file dialog if necessary.
    async saveFile() {
        let writable;
        if (!this.#fileHandle || !File.verifyPermission(this.#fileHandle)) {
            const handle = await File.saveAs();
            writable = await handle.createWritable();
        } else {
            writable = await this.#fileHandle.createWritable();
        }
        this.#grid.updateCircuit();
        await writable.write(JSON.stringify(this.#serialize(), null, Circuits.STRINGIFY_SPACE));
        await writable.close();
    }

    // Saves circuits as a new file.
    async saveFileAs() {
        const all = this.list();
        const handle = await File.saveAs(this.#fileName ?? all[0][1]);
        const writable = await handle.createWritable();
        this.#grid.updateCircuit();
        await writable.write(JSON.stringify(this.#serialize(), null, Circuits.STRINGIFY_SPACE));
        await writable.close();
        // make this the new file handle
        this.#fileHandle = handle;
        this.#fileName = handle.name;
        return handle.name;
    }

    // Clears all circuits and closes the currently open file.
    closeFile() {
        this.#fileHandle = null;
        this.#fileName = null;
        this.clear();
    }

    // Returns name of currently opened file.
    get fileName() {
        return this.#fileName;
    }

    // Returns current circuit.
    get current() {
        return this.#circuits[this.#currentCircuit];
    }

    // Returns true while all existing circuits are empty.
    get allEmpty() {
        this.#grid.updateCircuit();
        for (let circuit of this.#circuits) {
            if (circuit.data.length > 0) {
                return false;
            }
        }
        return true;
    }

    // Returns circuit by UID.
    byUID(uid) {
        return this.#circuits.find((c) => c.uid === uid) ?? null;
    }

    // Returns a list of loaded circuits.
    list() {
        let circuits = this.#circuits.map((c) => [ c.uid, c.label ]);
        circuits.sort((a, b) => {
            if (a[1] < b[1]) {
                return -1;
            } else if (a[1] > b[1]) {
                return 1;
            } else {
                return 0;
            }
        });
        return circuits;
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    clear() {
        this.#circuits = [ ];
        const label = this.#generateName();
        this.#circuits.push(new Circuit(label));
        this.#currentCircuit = 0;
        this.#setGrid(this.current.uid);
    }

    // Selects a circuit by UID.
    select(newCircuitUID) {
        this.#setGrid(newCircuitUID);
        this.current.identifyNets();
    }

    // Creates a new circuit.
    create() {
        // TODO: need proper input component
        const label = prompt('Circuit label', this.#generateName());
        this.#currentCircuit = this.#circuits.length;
        const circuit = new Circuit(label);
        this.#circuits.push(circuit);
        this.#setGrid(circuit.uid);
    }

    // Serializes loaded circuits for saving to file.
    #serialize() {
        return { version: 1, circuits: this.#circuits.map((c) => c.serialize([ 'gid' ])) };
    }

    // Unserializes circuits from file.
    #unserialize(content) {
        const newCircuitIndex = this.#circuits.length;
        let unserialized = content.circuits.map((c) => Circuit.unserialize(c));
        this.#circuits.push(...unserialized);
        for (let circuit of this.#circuits) {
            for (let item of circuit.data) {
                item.gid ??= crypto.randomUUID();
            }
            // LEGACY: set UID for legacy circuits
            circuit.uid ??= crypto.randomUUID();
            circuit.ports ??= CustomComponent.generateDefaultOutline(circuit.data);
        }
        return newCircuitIndex;
    }

    // Returns a generated name if the given name is empty.
    #generateName(name) {
        return name || 'New circuit #' + (this.#circuits.length + 1);
    }

    // Replaces the current grid contents with the given circuit. Does NOT save current contents.
    #setGrid(newCircuitUID) {
        const index = this.#circuits.findIndex((c) => c.uid === newCircuitUID);
        if (index > -1) {
            this.#currentCircuit = index;
            const circuit = this.#circuits[index];
            this.#grid.setCircuit(circuit);
            this.#grid.setSimulationLabel(null);
            this.#grid.render();
            return;
        }
        throw 'Could not find circuit ' + newCircuitUID;
    }

    // Prunes empty circuits (app starts with one empty circuit and loading appends by default, so the empty circuit should be pruned).
    #pruneEmpty() {
        for (let i = this.#circuits.length - 1; i >= 0; --i) {
            // TODO: don't prune user created empty circuits
            if (this.#circuits[i].data.length === 0) {
                this.#circuits.splice(i, 1);
                if (this.#currentCircuit === i) {
                    this.#currentCircuit = -1;
                }
            }
        }
    }
}
